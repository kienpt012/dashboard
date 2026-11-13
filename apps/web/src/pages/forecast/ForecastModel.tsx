import { DownloadOutlined, FileExcelOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Descriptions, Row, Select, Space, Statistic, Table, Upload } from 'antd';
import { useState } from 'react';
import { Page } from '@/components/Page';
import { Query } from '@/components/States';
import { YearSelect } from '@/components/Data';
import { Chart, chartColors } from '@/components/Chart';
import { useThemeMode } from '@/app/theme';
import { useAction, useApi } from '@/hooks/useApi';
import { errorText, http, query, saveBlob } from '@/lib/api';
import { currentYear, dateTime, num } from '@/lib/format';
import { forecastColumns, RISK } from './ForecastViews';
import type { ForecastList, ForecastRisk, ModelInfo } from './types';

export default function ForecastModel() {
  const [year, setYear] = useState(currentYear());
  const [risk, setRisk] = useState<ForecastRisk | undefined>();
  const [downloading, setDownloading] = useState(false);
  const { message } = App.useApp();
  const { dark } = useThemeMode();
  const colors = chartColors(dark);
  const model = useApi<ModelInfo>('/forecast/model');
  const forecasts = useApi<ForecastList>(`/forecast${query({ year, risk, scope: 'all' })}`, { keepPrevious: true });
  const train = useAction(() => http.post<ModelInfo>('/forecast/train', {}), { success: 'Đã cập nhật mô hình dự báo', refresh: ['/forecast'] });
  const upload = useAction((file: File) => { const form = new FormData(); form.append('file', file); return http.post<{ imported: number; duplicates: number }>('/forecast/history', form); }, { success: result => `Đã nhập ${num(result.imported)} dòng lịch sử; ${num(result.duplicates)} dòng đã có`, refresh: ['/forecast'] });
  async function download(template: boolean) {
    setDownloading(true);
    try { saveBlob(await http.blob(template ? '/forecast/history/template' : `/forecast/export${query({ year, risk, scope: 'all' })}`), template ? 'mau-lich-su-du-bao.xlsx' : `du-bao-${year}.xlsx`); }
    catch (error) { message.error(errorText(error)); }
    finally { setDownloading(false); }
  }
  return <Page title="Mô hình dự báo" meta="HT-09" extra={<Button type="primary" icon={<ReloadOutlined />} loading={train.isPending} onClick={() => train.mutate()}>Huấn luyện lại</Button>} wide>
    <div className="forecast-model">
      <Query query={model}>{data => <>
        <Card title="Thông tin mô hình">
          <Alert type={data.trained ? 'info' : 'warning'} showIcon title={data.sourceLabel} description={data.fallbackReason || undefined} style={{ marginBottom: 16 }} />
          {data.simulatedSamples > 0 && <Alert type="warning" showIcon title={`${num(data.simulatedSamples)} mẫu mô phỏng trong dữ liệu mô hình`} style={{ marginBottom: 16 }} />}
          <Descriptions column={{ xs: 1, md: 2, xl: 4 }} items={[
            { label: 'Huấn luyện', children: data.trainedAt ? dateTime(data.trainedAt) : 'Chưa có' },
            { label: 'Phiên bản đặc trưng', children: data.featureVersion },
            { label: 'Tổng mẫu', children: num(data.sampleCount) },
            { label: 'Chỉ tiêu lịch sử', children: num(data.targetCount) },
            { label: 'Mẫu huấn luyện', children: num(data.trainSamples) },
            { label: 'Mẫu kiểm tra', children: num(data.testSamples) },
            ...(data.history ? [{ label: 'Dòng lịch sử thực tế', children: num(data.history.realRows) }, { label: 'Dòng lịch sử mô phỏng', children: num(data.history.simulatedRows) }] : []),
          ]} />
          <div className="forecast-model-actions" style={{ marginTop: 18 }}>
            <Button icon={<DownloadOutlined />} loading={downloading} onClick={() => void download(true)}>Tải mẫu lịch sử</Button>
            <Upload accept=".xlsx,.csv" showUploadList={false} beforeUpload={file => { upload.mutate(file); return false; }}><Button icon={<UploadOutlined />} loading={upload.isPending}>Nhập lịch sử Excel/CSV</Button></Upload>
          </div>
        </Card>
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}><Card title="Đánh giá trên tập kiểm tra" style={{ height: '100%' }}>
            {data.evaluationLabel && <p className="muted">{data.evaluationLabel}</p>}
            {data.metrics ? <>
              <Row gutter={[16, 16]}><Col xs={12} sm={8}><Statistic title="AUC" value={data.metrics.auc ?? '—'} precision={3} /></Col><Col xs={12} sm={8}><Statistic title="Độ chính xác" value={data.metrics.accuracy * 100} precision={1} suffix="%" /></Col><Col xs={12} sm={8}><Statistic title="Brier" value={data.metrics.brier} precision={3} /></Col></Row>
              <Table size="small" pagination={false} rowKey="actual" style={{ marginTop: 20 }} dataSource={[
                { actual: 'Thực tế không đạt / trễ', predictedRisk: data.metrics.confusion.tp, predictedSafe: data.metrics.confusion.fn },
                { actual: 'Thực tế đạt đúng hạn', predictedRisk: data.metrics.confusion.fp, predictedSafe: data.metrics.confusion.tn },
              ]} columns={[{ title: 'Ma trận nhầm lẫn', dataIndex: 'actual' }, { title: 'Dự báo không đạt', dataIndex: 'predictedRisk', align: 'right' }, { title: 'Dự báo đạt', dataIndex: 'predictedSafe', align: 'right' }]} scroll={{ x: 440 }} />
            </> : <Alert type="warning" showIcon title="Chưa đủ dữ liệu để huấn luyện" description="Chỉ số đánh giá sẽ xuất hiện sau khi có tập kiểm tra gồm cả trường hợp đạt và không đạt." />}
          </Card></Col>
          <Col xs={24} xl={12}><Card title="Tầm quan trọng đặc trưng" style={{ height: '100%' }}>
            <Chart height={330} option={{ grid: { left: 4, top: 8, right: 20, bottom: 8, containLabel: true }, tooltip: { trigger: 'axis' }, xAxis: { type: 'value', axisLabel: { color: colors.sub }, splitLine: { lineStyle: { color: colors.line } } }, yAxis: { type: 'category', inverse: true, data: data.importance.slice(0, 10).map(item => item.label), axisLabel: { color: colors.text, width: 160, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } }, series: [{ name: 'Tầm quan trọng', type: 'bar', barMaxWidth: 18, itemStyle: { color: '#1677ff', borderRadius: [0, 3, 3, 0] }, data: data.importance.slice(0, 10).map(item => item.importance) }] }} />
          </Card></Col>
        </Row>
      </>}</Query>
      <Card title="Danh sách dự báo" extra={<Button icon={<FileExcelOutlined />} loading={downloading} onClick={() => void download(false)}>Xuất Excel</Button>}>
        <Space wrap style={{ marginBottom: 16 }}><YearSelect value={year} onChange={setYear} /><Select aria-label="Nguy cơ dự báo" allowClear placeholder="Nguy cơ (dự báo)" value={risk} onChange={setRisk} options={Object.entries(RISK).map(([value, item]) => ({ value, label: item.label }))} style={{ width: 185 }} /></Space>
        <Query query={forecasts}>{data => <Table rowKey="targetId" columns={forecastColumns()} dataSource={data.items} scroll={{ x: 900 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }} expandable={{ expandedRowRender: item => <><ul>{item.factors.map(factor => <li key={factor}>{factor}</li>)}</ul><span className="muted">{item.sourceLabel}</span></> }} />}</Query>
      </Card>
    </div>
  </Page>;
}
