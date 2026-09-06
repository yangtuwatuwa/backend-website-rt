// Compatibility exports. Seluruh query surat kanonik berada di
// suratPengajuanModel.js dan tidak lagi membaca data identitas live dari family/warga.
export {
    findSuratPengajuanById as getPengajuanById,
    listSuratPengajuanRows as getAllPengajuan,
    transitionSuratStatus as updatePengajuanStatus,
    updateSuratArchived as updatePengajuanArchivedStatus,
} from "./suratPengajuanModel.js";
