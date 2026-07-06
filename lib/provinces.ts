// Danh sách 34 đơn vị hành chính cấp tỉnh SAU SÁP NHẬP 2025 (hiệu lực 01/7/2025):
// 6 thành phố trực thuộc TW + 28 tỉnh. Dùng cho picker địa điểm dự án (giá theo tỉnh).
export const PROVINCES: string[] = [
  // 6 thành phố trực thuộc Trung ương
  "Hà Nội", "TP. Hồ Chí Minh", "Hải Phòng", "Đà Nẵng", "Cần Thơ", "Huế",
  // 28 tỉnh
  "An Giang", "Bắc Ninh", "Cà Mau", "Cao Bằng", "Đắk Lắk",
  "Điện Biên", "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Tĩnh",
  "Hưng Yên", "Khánh Hòa", "Lai Châu", "Lâm Đồng", "Lạng Sơn",
  "Lào Cai", "Nghệ An", "Ninh Bình", "Phú Thọ", "Quảng Ngãi",
  "Quảng Ninh", "Quảng Trị", "Sơn La", "Tây Ninh", "Thái Nguyên",
  "Thanh Hóa", "Tuyên Quang", "Vĩnh Long",
];

export const PROVINCE_OPTIONS = PROVINCES.map((p) => ({ value: p, label: p }));
