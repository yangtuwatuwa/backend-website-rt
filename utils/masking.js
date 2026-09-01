export function maskData(str) {
    if (!str) return "xxxxxxxxxxxx";
    const strVal = String(str);
    if (strVal.length < 6) {
        return "x".repeat(strVal.length || 12);
    }
    return strVal.slice(0, 3) + "x".repeat(strVal.length - 6) + strVal.slice(-3);
}

export function maskNik(value) {
    if (value === null || value === undefined || value === "") return null;
    const strVal = String(value);
    if (strVal.length <= 7) return "*".repeat(strVal.length);
    return strVal.slice(0, 4) + "*".repeat(strVal.length - 7) + strVal.slice(-3);
}

export function maskEmail(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const email = String(value).trim();
    const separatorIndex = email.lastIndexOf("@");
    if (separatorIndex <= 0 || separatorIndex === email.length - 1) {
        return email.slice(0, 1) + "***";
    }
    const localPart = email.slice(0, separatorIndex);
    const domain = email.slice(separatorIndex + 1);
    return localPart.slice(0, 1) + "***@" + domain;
}
