export const checkRt = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({
            pesan: "Akses ditolak, khusus RT cuy"
        });
    }
};
