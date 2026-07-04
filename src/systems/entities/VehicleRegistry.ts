export interface VehicleDefinition {
    id: string;
    acceleration: number;
    maxSpeed: number;
    turnSpeed: number;
    buoyant?: boolean;
    railBound?: boolean;
}

class VehicleRegistry {
    private definitions = new Map<string, VehicleDefinition>();
    register(definition: VehicleDefinition): void { this.definitions.set(definition.id, definition); }
    get(id: string): VehicleDefinition | undefined { return this.definitions.get(id); }
}

export const vehicleRegistry = new VehicleRegistry();
vehicleRegistry.register({ id: 'atlas:boat', acceleration: 12, maxSpeed: 7, turnSpeed: 2.5, buoyant: true });
vehicleRegistry.register({ id: 'atlas:minecart', acceleration: 8, maxSpeed: 8, turnSpeed: 0, railBound: true });
