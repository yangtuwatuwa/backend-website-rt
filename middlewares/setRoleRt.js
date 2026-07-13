export const setRoleRt = (req, res, next) => {
    req.body.role = "warga";
    next();
};
