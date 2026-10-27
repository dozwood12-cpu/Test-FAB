import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
  } catch { return false; }
}
export const roles = ['ANGGOTA', 'HOD', 'FA', 'GM', 'ADMIN'];
export const divisions = ['Mechanical', 'Electrical', 'Non-Technical'];
export function validateMember(data) {
  if (!data.name || data.name.length > 100) return 'Nama wajib diisi, maksimal 100 karakter.';
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(data.username)) return 'Username 3–64 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.';
  if (data.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Alamat email tidak valid.';
  if (data.password.length < 8 || data.password.length > 128) return 'Kata sandi harus 8–128 karakter.';
  if (!roles.includes(data.role) || !divisions.includes(data.division)) return 'Peran atau divisi tidak valid.';
  return null;
}
