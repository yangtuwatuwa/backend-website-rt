import db from "../config/sqlconfig.js"

export async function createAccessLog(username, eventType, ipAddress, userAgent, status = "success", details = "", executor = db) {
    const client = executor || db
    const sqlcommand = "INSERT INTO access_logs (id, username, event_type, ip_address, user_agent, status, details) VALUES (NULL, ?, ?, ?, ?, ?, ?)"
    try {
        const [result] = await client.execute(sqlcommand, [username || "unknown", eventType, ipAddress || "127.0.0.1", userAgent || "unknown", status, details])
        return result
    } catch (err) {
        if (client !== db) {
            console.log("error createAccessLog:", err)
            return "error karena: " + err
        }

        try {
            await client.execute(`
                CREATE TABLE IF NOT EXISTS access_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(255),
                    event_type VARCHAR(100),
                    ip_address VARCHAR(100),
                    user_agent TEXT,
                    status VARCHAR(50),
                    details TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `)
            const [result] = await client.execute(sqlcommand, [username || "unknown", eventType, ipAddress || "127.0.0.1", userAgent || "unknown", status, details])
            return result
        } catch (tableErr) {
            console.log("error createAccessLog:", tableErr)
            return "error karena: " + tableErr
        }
    }
}

export async function getAccessLogs(limit = 100, executor = db) {
    const client = executor || db
    const sqlcommand = "SELECT * FROM access_logs ORDER BY created_at DESC LIMIT ?"
    try {
        const [result] = await client.execute(sqlcommand, [String(limit)])
        return result
    } catch (err) {
        if (client !== db) {
            console.log("error getAccessLogs:", err)
            return []
        }

        try {
            await client.execute(`
                CREATE TABLE IF NOT EXISTS access_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(255),
                    event_type VARCHAR(100),
                    ip_address VARCHAR(100),
                    user_agent TEXT,
                    status VARCHAR(50),
                    details TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `)
            const [result] = await client.execute("SELECT * FROM access_logs ORDER BY created_at DESC LIMIT ?", [String(limit)])
            return result
        } catch (tableErr) {
            console.log("error getAccessLogs:", tableErr)
            return []
        }
    }
}
