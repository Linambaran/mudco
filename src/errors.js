// Error catalog (FSD Bagian 6) and the one exception type shared by the domain and api layers.
export const MSG = {
  'ERR-VAL-01': 'QR Code tidak valid, silakan hubungi staf',
  'ERR-VAL-02': 'Jumlah item minimal 1 dan maksimal 20',
  'ERR-VAL-03': 'Pilih minimal 1 menu sebelum checkout',
  'ERR-VAL-04': 'Menu [nama] sedang habis, silakan hapus dari keranjang',
  'ERR-VAL-05': 'Nomor meja tidak valid (1–10)',
  'ERR-VAL-06': 'Pilih metode pembayaran',
  'ERR-VAL-07': 'Masukkan username / Password minimal 8 karakter',
  'ERR-VAL-08': 'Periksa kembali data menu (nama, harga, HPP)',
  'ERR-VAL-09': 'Menu memiliki riwayat transaksi, nonaktifkan sebagai gantinya',
  'ERR-VAL-10': 'Periksa kembali data bahan baku',
  'ERR-VAL-11': 'Jumlah stok tidak valid',
  'ERR-VAL-12': 'Rentang tanggal tidak valid',
  'ERR-BIZ-01': 'Pesanan tidak tersedia',
  'ERR-BIZ-02': 'Pesanan ini sudah dikonfirmasi sebelumnya',
  'ERR-BIZ-03': 'Mulai proses pesanan terlebih dahulu',
  'ERR-AUTH-01': 'Anda harus login untuk mengakses halaman ini',
  'ERR-AUTH-02': 'Username atau password salah',
  'ERR-AUTH-03': 'Akun dikunci. Coba lagi dalam 15 menit',
  'ERR-AUTH-04': 'Anda tidak memiliki izin untuk mengakses halaman ini',
  'ERR-SYS-01': 'Layanan tidak tersedia. Silakan coba lagi',
  'ERR-SYS-02': 'Gagal memuat menu, periksa koneksi internet Anda',
  'ERR-SYS-04': 'Nota gagal dicetak, silakan cetak ulang manual',
  'ERR-SYS-05': '', // race condition: handled silently
};
export const soldOutMsg = nama => MSG['ERR-VAL-04'].replace('[nama]', nama);

// INHERITANCE: specialises Error with a catalog code and the list of invalid form fields.
export class ApiError extends Error {
  constructor(code, text, fields) {
    super(text ?? MSG[code]);
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields || [];
  }
}
