interface CloudHandlers {
    setTexture: (url: string) => void;
    updateColor: (dayFactor: number, classic: boolean) => void;
}

let handlers: CloudHandlers | null = null;

export const registerCloudHandlers = (nextHandlers: CloudHandlers | null) => {
    handlers = nextHandlers;
};

export const setCloudTexture = (url: string) => {
    handlers?.setTexture(url);
};

/** `classic`: the pre-overhaul clouds (tinted dark at night, no sky colour). */
export const updateCloudColor = (dayFactor: number, classic = false) => {
    handlers?.updateColor(dayFactor, classic);
};
