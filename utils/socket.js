import { Server } from "socket.io"

let io = null

export function initSocket(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST", "PATCH", "DELETE"]
        }
    })

    io.on("connection", (socket) => {
        console.log(`[Socket] User connected: ${socket.id}`)

        socket.on("disconnect", () => {
            console.log(`[Socket] User disconnected: ${socket.id}`)
        })
    })

    return io
}

export function getIO() {
    if (!io) {
        throw new Error("Socket.io has not been initialized!")
    }
    return io
}

/**
 * Utility function to emit dynamic sync triggers to all clients.
 * @param {string} type - The sync event type (e.g. 'finance', 'warga', 'pengaduan', 'pengajuan', 'announcement', 'agenda', 'vote')
 */
export function emitSyncEvent(type) {
    if (io) {
        console.log(`[Socket] Emitting sync event: ${type}`)
        io.emit("sync", { type })
    }
}
