import { connect } from 'node:net';

export function isLocalBrokerStatusMessage(message: any): boolean {
  return message?.type === 'frontend_status_ack' || message?.type === 'frontend_receipt';
}

export async function sendRemoteBrokerMessage(port: number, message: Record<string, unknown>, timeoutMs = 2000): Promise<any> {
  const socket = connect({ host: '127.0.0.1', port });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  socket.write([
    'GET / HTTP/1.1',
    `Host: 127.0.0.1:${port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Key: Z29kb3QtZGV2dG9vbC1icm9rZXI=',
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n'));
  await readHttpUpgrade(socket, timeoutMs);
  sendMaskedTextFrame(socket, JSON.stringify(message));
  try {
    const payload = await readWebSocketTextFrame(socket, timeoutMs);
    return JSON.parse(payload);
  } finally {
    socket.destroy();
  }
}

function readHttpUpgrade(socket: import('node:net').Socket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => finish(new Error('Timed out waiting for broker WebSocket upgrade.')), timeoutMs);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.includes('\r\n\r\n')) finish();
    };
    const onError = (error: Error) => finish(error);
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

function sendMaskedTextFrame(socket: import('node:net').Socket, payload: string): void {
  const data = Buffer.from(payload, 'utf8');
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const header = data.length < 126
    ? Buffer.from([0x81, 0x80 | data.length])
    : Buffer.from([0x81, 0x80 | 126, data.length >> 8, data.length & 0xff]);
  const masked = Buffer.from(data);
  for (let index = 0; index < masked.length; index += 1) masked[index] ^= mask[index % 4];
  socket.write(Buffer.concat([header, mask, masked]));
}

function readWebSocketTextFrame(socket: import('node:net').Socket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => finish(undefined, new Error('Timed out waiting for broker WebSocket response.')), timeoutMs);
    const finish = (payload?: string, error?: Error) => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      if (error) reject(error);
      else resolve(payload ?? '');
    };
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const frame = decodeWebSocketFrame(buffer);
      if (frame) finish(frame.payload);
    };
    const onError = (error: Error) => finish(undefined, error);
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

function decodeWebSocketFrame(buffer: Buffer): { payload: string; bytesRead: number } | null {
  if (buffer.length < 2) return null;
  const second = buffer[1];
  let offset = 2;
  let length = second & 0x7f;
  if (length === 126) {
    if (buffer.length < offset + 2) return null;
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null;
    length = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }
  if (second & 0x80) offset += 4;
  if (buffer.length < offset + length) return null;
  return { payload: buffer.subarray(offset, offset + length).toString('utf8'), bytesRead: offset + length };
}
