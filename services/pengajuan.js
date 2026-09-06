// Compatibility exports. Gunakan suratPengajuanService.js untuk kode baru.
export {
    approveSuratPengajuanService as changePengajuanStatusToApproved,
    archiveSuratPengajuanService as archivePengajuanService,
    createSuratPengajuanService as createPengajuan,
    listMySuratPengajuanService as listPengajuanWarga,
    listSuratPengajuanService as listAllPengajuan,
    rejectSuratPengajuanService as changePengajuanStatusToRejected,
} from "./suratPengajuanService.js";
