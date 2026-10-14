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

export function Chart({ option, height = 240, style, onClick }: { option: ChartOption; height?: number; style?: CSSProperties; onClick?: (params: { name?: string; seriesName?: string; dataIndex?: number; data?: unknown }) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const { dark } = useThemeMode();
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!ref.current) return;
    const instance = echarts.init(ref.current, undefined, { renderer: 'svg' });
    chart.current = instance;
    instance.on('click', params => clickRef.current?.(params as never));
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const colors = chartColors(dark);
    chart.current?.setOption(
      {
        textStyle: { fontFamily: "'Be Vietnam Pro', system-ui, sans-serif", color: colors.text },
        tooltip: { backgroundColor: colors.bg, borderColor: colors.line, textStyle: { color: colors.text, fontSize: 12 }, confine: true },
        animationDuration: 400,
        ...option,
      },
      true,
    );
  }, [option, dark]);

  return <div ref={ref} style={{ height, width: '100%', cursor: onClick ? 'pointer' : undefined, ...style }} />;
}
