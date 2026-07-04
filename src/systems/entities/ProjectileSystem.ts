export interface GenericProjectile {
    id: number;
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    gravity: number;
    drag: number;
    ttl: number;
    ownerId?: number;
    data?: unknown;
}

export interface ProjectileHit { projectile: GenericProjectile; x: number; y: number; z: number }

export class ProjectileSystem {
    private projectiles = new Map<number, GenericProjectile>();
    private nextId = 1;
    spawn(value: Omit<GenericProjectile, 'id'>): GenericProjectile {
        const projectile = { ...value, id: this.nextId++ };
        this.projectiles.set(projectile.id, projectile);
        return projectile;
    }
    tick(delta: number, collides: (x: number, y: number, z: number) => boolean): ProjectileHit[] {
        const hits: ProjectileHit[] = [];
        for (const projectile of this.projectiles.values()) {
            projectile.ttl -= delta;
            projectile.vy -= projectile.gravity * delta;
            const damping = Math.pow(projectile.drag, delta * 20);
            projectile.vx *= damping; projectile.vy *= damping; projectile.vz *= damping;
            projectile.x += projectile.vx * delta; projectile.y += projectile.vy * delta; projectile.z += projectile.vz * delta;
            if (projectile.ttl <= 0 || collides(projectile.x, projectile.y, projectile.z)) {
                hits.push({ projectile: { ...projectile }, x: projectile.x, y: projectile.y, z: projectile.z });
                this.projectiles.delete(projectile.id);
            }
        }
        return hits;
    }
}
