export const isEditableElement = (target: EventTarget | null): target is HTMLElement => {
    if (!(target instanceof HTMLElement)) return false;

    const tagName = target.tagName;
    return (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        target.isContentEditable
    );
};
