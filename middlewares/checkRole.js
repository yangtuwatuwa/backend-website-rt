export const checkRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ pesan: "Unauthorized, silakan login dulu cuy" })
        }

        const userRole = req.user.role

        // Map 'sekretaris' ke 'sekertaris' agar cocok dengan enum database MySQL
        const mappedAllowedRoles = allowedRoles.map(role => 
            role === "sekretaris" ? "sekertaris" : role
        )

        if (mappedAllowedRoles.includes(userRole)) {
            next()
        } else {
            return res.status(403).json({
                pesan: `Akses ditolak, role ${userRole} tidak diizinkan mengakses resource ini!`
            })
        }
    }
}
