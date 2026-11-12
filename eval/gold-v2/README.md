# Bộ đề chấm quy trình xử lý văn bản bản 2

Mỗi file `*.json` là đáp án của một văn bản: danh sách chỉ tiêu đúng (tên, giá trị, đơn vị, số thứ tự, chữ ở cột Kế
hoạch, nhóm theo văn bản, lĩnh vực chuẩn). Trường nào không ghi thì không chấm. Sau mỗi lần sửa code, prompt hoặc
model: đọc lại văn bản trên máy có Ollama, xuất đề xuất ra JSON, rồi chấm.

## Quy tắc

- Chỉ dùng văn bản **chưa dùng để train** model. Bộ `van-ban-mau-232` và PL2 QĐ 333 là dữ liệu train của
  `qwen3-chitieu:v2`, không được dùng để chấm model đó.
- Văn bản nội bộ không đưa lên GitHub: đáp án của chúng để ở máy chạy thử (cùng định dạng), chỉ đáp án của văn bản mẫu
  tự soạn hoặc văn bản công khai mới nằm trong thư mục này.
- Đáp án do người soạn và rà. Không lấy kết quả của máy làm đáp án.

## Xuất đề xuất của một văn bản

```bash
docker exec ioc-laithieu-db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "
  select coalesce(json_agg(c order by c.\"documentOrder\"), '[]') from (
    select c.kind, c.name, c.\"targetValue\", c.unit, c.ordinal, c.\"groupName\", c.category, c.\"targetText\",
           c.\"sourceQuote\", c.direction, c.\"extractionMethod\", c.\"documentOrder\"
    from \"IndicatorCandidate\" c join \"SourceDocument\" d on d.id = c.\"documentId\"
    where d.code = 'VB-2026-0007'
  ) c" > de-xuat.json
```

## Chấm

```bash
npm run build -w @ioc/api
node scripts/score-extraction.mjs --gold eval/gold-v2/qd015.json --candidates de-xuat.json --json ket-qua.json
```

Kết quả in ra: số chỉ tiêu bắt được (recall), tỷ lệ đề xuất đúng (precision), độ chính xác từng trường trên các cặp đã
khớp, rồi danh sách thiếu, thừa và sai trường. Thêm `--min-recall 0.95 --min-precision 0.9` để lệnh trả mã lỗi khi
kết quả tụt dưới ngưỡng.

## Định dạng đáp án

```json
{
  "document": "Tên văn bản",
  "note": "Ai soạn, ngày nào, nguồn",
  "indicators": [
    { "ordinal": "1", "name": "Tổng thu ngân sách nhà nước trên địa bàn", "value": 125.5, "unit": "tỷ đồng",
      "plan": ">= 125,5", "group": "1. Chỉ tiêu về kinh tế", "category": "Kinh tế" }
  ]
}
```

Hai chỉ tiêu trong cùng một mục dùng chung `ordinal`. Chỉ tiêu dạng khoảng ghi `value` là cận dưới và `plan` là
"70 - 75".
