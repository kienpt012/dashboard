import { App as AntApp, ConfigProvider, theme as antTheme, type ThemeConfig } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocality } from './locality';

export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'ioc_theme';
const FONT = "'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

const EXPOSED = [
  'colorPrimary',
  'colorPrimaryBg',
  'colorPrimaryBgHover',
  'colorPrimaryBorder',
  'colorPrimaryText',
  'colorText',
  'colorTextSecondary',
  'colorTextTertiary',
  'colorTextQuaternary',
  'colorBorder',
  'colorBorderSecondary',
  'colorBgContainer',
  'colorBgLayout',
  'colorBgElevated',
  'colorFillSecondary',
  'colorFillTertiary',
  'colorFillQuaternary',
  'colorSuccess',
  'colorSuccessBg',
  'colorWarning',
  'colorWarningBg',
  'colorError',
  'colorErrorBg',
  'colorInfo',
];

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

type ThemeState = { choice: ThemeChoice; dark: boolean; setChoice: (choice: ThemeChoice) => void };
const ThemeContext = createContext<ThemeState>({ choice: 'system', dark: false, setChoice: () => undefined });

export const useThemeMode = () => useContext(ThemeContext);

/** Pha màu với trắng để màu chủ đạo đủ sáng trên nền tối. */
function lighten(hex: string, amount: number) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    return Math.round(c + (255 - c) * amount);
  };
  return `#${[16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

function tokens(dark: boolean, seed: string): ThemeConfig {
  const primary = dark ? lighten(seed, 0.28) : seed;
  return {
    algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: primary,
      colorInfo: primary,
      colorSuccess: '#16a34a',
      colorWarning: '#d97706',
      colorError: '#dc2626',
      fontFamily: FONT,
      fontSize: 14,
      borderRadius: 6,
      borderRadiusLG: 8,
      colorBgLayout: dark ? '#0d0f13' : '#f3f5f8',
      colorBgContainer: dark ? '#15181e' : '#ffffff',
      colorBgElevated: dark ? '#1c2028' : '#ffffff',
      colorBorderSecondary: dark ? '#262a33' : '#e9ecf1',
      colorBorder: dark ? '#353a45' : '#d6dbe3',
      colorText: dark ? 'rgba(255,255,255,0.88)' : '#1b2330',
      colorTextSecondary: dark ? 'rgba(255,255,255,0.62)' : '#5b6575',
      colorTextTertiary: dark ? 'rgba(255,255,255,0.45)' : '#8a93a2',
      boxShadowTertiary: dark ? '0 1px 2px rgba(0,0,0,0.4)' : '0 1px 2px rgba(16,24,40,0.04)',
      motionDurationMid: '0.16s',
      motionDurationSlow: '0.2s',
    },
    components: {
      Layout: {
        siderBg: dark ? '#15181e' : '#ffffff',
        headerBg: dark ? '#15181e' : '#ffffff',
        headerHeight: 56,
        headerPadding: '0 20px',
        bodyBg: dark ? '#0d0f13' : '#f3f5f8',
        triggerBg: dark ? '#15181e' : '#ffffff',
      },
      Menu: {
        itemBorderRadius: 6,
        itemHeight: 36,
        itemMarginInline: 8,
        itemMarginBlock: 1,
        groupTitleFontSize: 12,
        groupTitleColor: dark ? 'rgba(255,255,255,0.4)' : '#8a93a2',
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        activeBarBorderWidth: 0,
        iconSize: 16,
        collapsedIconSize: 17,
      },
      Card: { headerFontSize: 16, headerHeight: 52, paddingLG: 20 },
      Table: {
        headerBg: dark ? '#1d293a' : '#e8eff8',
        headerColor: dark ? '#eaf2ff' : '#16324f',
        headerSplitColor: dark ? '#34465e' : '#cfdae8',
        headerSortActiveBg: dark ? '#273a53' : '#dce8f7',
        headerSortHoverBg: dark ? '#2d425e' : '#d3e2f4',
        headerFilterHoverBg: dark ? '#34465e' : '#cfdae8',
        bodySortBg: dark ? '#181e28' : '#f8fafd',
        rowHoverBg: dark ? '#233249' : '#edf4ff',
        cellPaddingInline: 16,
        cellPaddingInlineSM: 12,
        cellPaddingBlock: 11,
        cellPaddingBlockSM: 7,
      },
      Tabs: { horizontalItemGutter: 28 },
      Descriptions: { labelBg: dark ? '#1a1e25' : '#f7f8fa' },
      Statistic: { contentFontSize: 26, titleFontSize: 13 },
      Modal: { titleFontSize: 16 },
      Drawer: { footerPaddingBlock: 12 },
      Segmented: { itemSelectedBg: dark ? '#2a2f3a' : '#ffffff' },
    },
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const [systemDark, setSystemDark] = useState(() => media().matches);
  const locality = useLocality();

  useEffect(() => {
    const query = media();
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const dark = choice === 'dark' || (choice === 'system' && systemDark);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.style.background = dark ? '#0d0f13' : '#f3f5f8';
  }, [dark]);

  const value = useMemo<ThemeState>(
    () => ({
      choice,
      dark,
      setChoice(next) {
        try {
          if (next === 'system') localStorage.removeItem(KEY);
          else localStorage.setItem(KEY, next);
        } catch {
          /* trình duyệt chặn lưu trữ */
        }
        setChoiceState(next);
      },
    }),
    [choice, dark],
  );

  const config = useMemo(() => tokens(dark, locality.primaryColor || '#1d4ed8'), [dark, locality.primaryColor]);

  // Đưa các mã màu của Ant Design ra biến CSS toàn cục để phần tự vẽ (khung, biểu đồ, bản in) dùng chung.
  useLayoutEffect(() => {
    const token = antTheme.getDesignToken(config) as unknown as Record<string, string | number>;
    const style = document.documentElement.style;
    for (const key of EXPOSED) {
      const name = `--ioc-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
      style.setProperty(name, String(token[key]));
    }
  }, [config]);

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider locale={viVN} theme={config} componentSize="middle">
        <AntApp message={{ maxCount: 3 }} notification={{ placement: 'bottomRight' }}>
          {children}
        </AntApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
