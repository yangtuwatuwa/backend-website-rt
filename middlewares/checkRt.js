export const checkRt = (req, res, next) => {
    if (req.user && req.user.role === 'rt') {
        next();
    } else {
        return res.status(403).json({
            pesan: "Akses ditolak, khusus RT cuy"
        });
    }
};
