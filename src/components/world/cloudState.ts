interface CloudHandlers {
    updateColor: (dayFactor: number, classic: boolean) => void;
}

let handlers: CloudHandlers | null = null;

export const registerCloudHandlers = (nextHandlers: CloudHandlers | null) => {
    handlers = nextHandlers;
};

/** `classic`: the pre-overhaul clouds (tinted dark at night, no sky colour). */
export const updateCloudColor = (dayFactor: number, classic = false) => {
    handlers?.updateColor(dayFactor, classic);
};
