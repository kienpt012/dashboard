# Cập nhật mục lục, số trang trong HDSD-IOC.docx rồi xuất HDSD-IOC.pdf bằng Microsoft Word.
# Cần Microsoft Word trên Windows. Chạy: powershell -NoProfile -ExecutionPolicy Bypass -File docs/huong-dan-su-dung/xuat-pdf.ps1
param(
  [string]$Docx = (Join-Path $PSScriptRoot 'HDSD-IOC.docx'),
  [string]$Pdf = (Join-Path $PSScriptRoot 'HDSD-IOC.pdf')
)

$ErrorActionPreference = 'Stop'
$Docx = (Resolve-Path -LiteralPath $Docx).Path
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $document = $word.Documents.Open($Docx, $false, $false)
  # Hai lượt: lượt đầu dựng mục lục, lượt sau cập nhật số trang sau khi mục lục chiếm chỗ.
  foreach ($pass in 1..2) {
    foreach ($toc in $document.TablesOfContents) { $toc.Update() }
    $document.Fields.Update() | Out-Null
    foreach ($section in $document.Sections) {
      foreach ($index in 1..3) {
        $section.Headers.Item($index).Range.Fields.Update() | Out-Null
        $section.Footers.Item($index).Range.Fields.Update() | Out-Null
      }
    }
  }
  $document.Save()
  # 17 = wdExportFormatPDF; tạo dấu trang theo đề mục để PDF có mục lục bên trái.
  $document.ExportAsFixedFormat($Pdf, 17, $false, 0, 0, 0, 0, 0, $true, $true, 1, $true, $true, $false)
  $document.Close($false)
  Write-Host "Đã xuất $Pdf"
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
