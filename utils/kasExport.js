import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const rupiah = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
});

function formatDate(value) {
    if (!value) return "-";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
}

export async function buildKasExcelBuffer({ transactions, summary, title = "Laporan Kas RT" }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sistem RT/RW";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Kas RT", {
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    sheet.mergeCells("A1:F1");
    sheet.getCell("A1").value = title;
    sheet.getCell("A1").font = { bold: true, size: 16 };
    sheet.getCell("A1").alignment = { horizontal: "center" };
    sheet.addRow([]);
    sheet.addRow(["Saldo awal", Number(summary.saldo_awal ?? 0)]);
    sheet.addRow(["Total pemasukan", Number(summary.total_pemasukan)]);
    sheet.addRow(["Total pengeluaran", Number(summary.total_pengeluaran)]);
    sheet.addRow(["Saldo akhir", Number(summary.saldo_akhir)]);
    sheet.addRow(["Jumlah transaksi", Number(summary.jumlah_transaksi)]);
    sheet.addRow([]);

    const header = sheet.addRow(["No", "Tanggal", "Tipe", "Kategori", "Deskripsi", "Nominal"]);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    transactions.forEach((item, index) => {
        sheet.addRow([
            index + 1,
            formatDate(item.tanggal),
            item.tipe_mutasi,
            item.kategori_kas,
            item.deskripsi,
            Number(item.nominal),
        ]);
    });

    sheet.columns = [
        { width: 8 },
        { width: 14 },
        { width: 12 },
        { width: 22 },
        { width: 55 },
        { width: 20 },
    ];
    sheet.getColumn(6).numFmt = '"Rp" #,##0.00';
    sheet.autoFilter = { from: header.getCell(1).address, to: header.getCell(6).address };
    sheet.views = [{ state: "frozen", ySplit: header.number }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildKasPdfBuffer({ transactions, summary, title = "Laporan Kas RT", filters = {} }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, bufferPages: true });
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("error", reject);
        doc.on("end", () => resolve(Buffer.concat(chunks)));

        doc.fontSize(18).font("Helvetica-Bold").text(title, { align: "center" });
        doc.moveDown(0.4).fontSize(9).font("Helvetica").text(
            `Periode: ${filters.tanggal_mulai || "awal"} s.d. ${filters.tanggal_selesai || "sekarang"}`,
            { align: "center" },
        );
        doc.moveDown();
        doc.font("Helvetica-Bold").fontSize(10).text(
            `Saldo awal: ${rupiah.format(summary.saldo_awal ?? 0)}    ` +
            `Pemasukan: ${rupiah.format(summary.total_pemasukan)}    ` +
            `Pengeluaran: ${rupiah.format(summary.total_pengeluaran)}    ` +
            `Saldo: ${rupiah.format(summary.saldo_akhir)}`,
        );
        doc.moveDown();

        const columns = [36, 68, 140, 195, 310, 615];
        const widths = [28, 68, 50, 110, 300, 120];
        const drawHeader = () => {
            doc.font("Helvetica-Bold").fontSize(8);
            ["No", "Tanggal", "Tipe", "Kategori", "Deskripsi", "Nominal"].forEach((label, index) => {
                doc.text(label, columns[index], doc.y, { width: widths[index] });
            });
            doc.moveDown(0.8).moveTo(36, doc.y).lineTo(756, doc.y).stroke();
            doc.moveDown(0.4);
        };
        drawHeader();

        transactions.forEach((item, index) => {
            if (doc.y > 520) {
                doc.addPage();
                drawHeader();
            }
            const y = doc.y;
            doc.font("Helvetica").fontSize(8);
            const values = [
                String(index + 1),
                formatDate(item.tanggal),
                item.tipe_mutasi,
                item.kategori_kas,
                item.deskripsi,
                rupiah.format(Number(item.nominal)),
            ];
            values.forEach((value, columnIndex) => {
                doc.text(String(value), columns[columnIndex], y, {
                    width: widths[columnIndex],
                    height: 28,
                    ellipsis: true,
                    align: columnIndex === 5 ? "right" : "left",
                });
            });
            doc.y = y + 30;
        });

        const range = doc.bufferedPageRange();
        for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
            doc.switchToPage(pageIndex);
            doc.fontSize(7).font("Helvetica").text(
                `Dicetak ${new Date().toLocaleString("id-ID")} - Halaman ${pageIndex + 1} dari ${range.count}`,
                36,
                555,
                { width: 720, align: "center" },
            );
        }
        doc.end();
    });
}
