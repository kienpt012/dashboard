import { BarChart, GaugeChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { useEffect, useRef, type CSSProperties } from 'react';
import { useThemeMode } from '@/app/theme';

echarts.use([PieChart, BarChart, LineChart, GaugeChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, SVGRenderer]);

export type ChartOption = echarts.EChartsCoreOption;

/** Màu chữ/lưới của biểu đồ theo chế độ sáng/tối. */
export function chartColors(dark: boolean) {
  return {
    text: dark ? 'rgba(255,255,255,0.85)' : '#1b2330',
    sub: dark ? 'rgba(255,255,255,0.55)' : '#5b6575',
    line: dark ? '#2a2f3a' : '#e9ecf1',
    bg: dark ? '#1c2028' : '#ffffff',
  };
}

function apply(instance: echarts.ECharts, option: ChartOption, dark: boolean) {
  const colors = chartColors(dark);
  instance.setOption(
    {
      textStyle: { fontFamily: "'Be Vietnam Pro', system-ui, sans-serif", color: colors.text },
      tooltip: { backgroundColor: colors.bg, borderColor: colors.line, textStyle: { color: colors.text, fontSize: 12 }, confine: true },
      animationDuration: 400,
      ...option,
    },
    true,
  );
}

export function Chart({ option, height = 240, style, onClick }: { option: ChartOption; height?: number; style?: CSSProperties; onClick?: (params: { name?: string; seriesName?: string; dataIndex?: number; data?: unknown }) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const { dark } = useThemeMode();
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const latest = useRef({ option, dark });
  latest.current = { option, dark };

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Chỉ khởi tạo khi khung đã có kích thước (biểu đồ nằm trong thẻ đang ẩn, widget đang thu gọn…), rồi vẽ ngay
    // tuỳ chọn mới nhất.
    const start = () => {
      if (chart.current || !element.clientWidth || !element.clientHeight) return;
      const instance = echarts.init(element, undefined, { renderer: 'svg' });
      chart.current = instance;
      instance.on('click', params => clickRef.current?.(params as never));
      apply(instance, latest.current.option, latest.current.dark);
    };
    const observer = new ResizeObserver(() => (chart.current ? chart.current.resize() : start()));
    observer.observe(element);
    start();
    return () => {
      observer.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (chart.current) apply(chart.current, option, dark);
  }, [option, dark]);

  return <div ref={ref} style={{ height, width: '100%', cursor: onClick ? 'pointer' : undefined, ...style }} />;
}
