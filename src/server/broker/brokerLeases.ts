export type BrokerLeaseKind = 'editor' | 'frontend' | 'runtime' | 'pending_command';

export interface BrokerLease {
  id: string;
  kind: BrokerLeaseKind;
  owner: string;
  createdAt: string;
  expiresAtMs: number | null;
}

export class BrokerLeaseRegistry {
  private leases = new Map<string, BrokerLease>();

  acquire(kind: BrokerLeaseKind, owner: string, ttlMs?: number): BrokerLease {
    const id = `${kind}:${owner}`;
    const lease: BrokerLease = {
      id,
      kind,
      owner,
      createdAt: new Date().toISOString(),
      expiresAtMs: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : null,
    };
    this.leases.set(id, lease);
    return lease;
  }

  release(id: string): void {
    this.leases.delete(id);
  }

  releaseByOwner(owner: string): void {
    for (const [id, lease] of this.leases.entries()) {
      if (lease.owner === owner) {
        this.leases.delete(id);
      }
    }
  }

  clear(): void {
    this.leases.clear();
  }

  pruneExpired(nowMs = Date.now()): void {
    for (const [id, lease] of this.leases.entries()) {
      if (lease.expiresAtMs !== null && lease.expiresAtMs <= nowMs) {
        this.leases.delete(id);
      }
    }
  }

  active(): BrokerLease[] {
    this.pruneExpired();
    return [...this.leases.values()];
  }

  snapshot(): Record<string, unknown> {
    return {
      active: this.active(),
      count: this.leases.size,
    };
  }
}
