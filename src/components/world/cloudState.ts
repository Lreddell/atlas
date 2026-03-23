interface CloudHandlers {
    setTexture: (url: string) => void;
    updateColor: (dayFactor: number) => void;
}

let handlers: CloudHandlers | null = null;

export const registerCloudHandlers = (nextHandlers: CloudHandlers | null) => {
    handlers = nextHandlers;
};

export const setCloudTexture = (url: string) => {
    handlers?.setTexture(url);
};

export const updateCloudColor = (dayFactor: number) => {
    handlers?.updateColor(dayFactor);
};
