import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"
import { inspectArchiveMedia, MAX_ARCHIVE_IMAGE_SIZE } from "../utils/archiveMedia.js"

let tempDir
let pngPath
let invalidPath

before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-media-test-"))
    pngPath = path.join(tempDir, "valid.png")
    invalidPath = path.join(tempDir, "fake.jpg")
    const onePixelPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64"
    )
    await fs.writeFile(pngPath, onePixelPng)
    await fs.writeFile(invalidPath, "ini bukan gambar")
})

after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
})

test("menerima foto berdasarkan signature biner", async () => {
    const result = await inspectArchiveMedia(pngPath, 100)
    assert.deepEqual(result, { mediaType: "image", mimeType: "image/png" })
})

test("menolak file non-media walaupun berekstensi jpg", async () => {
    await assert.rejects(inspectArchiveMedia(invalidPath, 100), /tidak dikenali/)
})

test("menolak foto yang melebihi 10 MB", async () => {
    await assert.rejects(
        inspectArchiveMedia(pngPath, MAX_ARCHIVE_IMAGE_SIZE + 1),
        /maksimal 10 MB/
    )
})
