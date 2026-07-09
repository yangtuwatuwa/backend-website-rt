export function maskData(str) {
    if (!str) return "xxxxxxxxxxxx";
    const strVal = String(str);
    if (strVal.length < 6) {
        return "x".repeat(strVal.length || 12);
    }
    return strVal.slice(0, 3) + "x".repeat(strVal.length - 6) + strVal.slice(-3);
}
