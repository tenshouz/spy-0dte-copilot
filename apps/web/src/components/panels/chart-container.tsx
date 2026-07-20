"use client";

import type { Candle, QuoteSourceState } from "@spy-copilot/shared";
import {
  ColorType,
  CrosshairMode,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  createChart,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

/** lightweight-charts brands its time values; our Candle.time is a plain unix-seconds number. */
const asTime = (t: number) => t as unknown as Time;

/** Market-time label (America/New_York) from unix seconds — built-in Intl only. */
function formatEasternTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ChartVwapPoint {
  time: number;
  value: number;
}

export interface ChartReferenceLine {
  price: number;
  title: string;
  color: string;
  lineStyle?: number;
}

interface ChartContainerProps {
  candles: Candle[];
  /** Legacy scalar overlay retained only for explicitly mocked fallback data. */
  vwap?: number;
  /** Cumulative per-candle RTH VWAP series; timestamps are unix seconds at this chart boundary. */
  vwapSeries?: ChartVwapPoint[];
  /** Independent quote-driven marker. It never mutates official candle OHLC values. */
  livePrice?: number;
  livePriceSourceState?: QuoteSourceState;
  openingRangeHigh?: number | null;
  openingRangeLow?: number | null;
  premarketHigh?: number;
  premarketLow?: number;
  /** Previous-session reference levels. */
  previousClose?: number;
  previousHigh?: number;
  previousLow?: number;
  /** Additional deterministic reference levels such as pivots and alternate opening ranges. */
  additionalPriceLines?: readonly ChartReferenceLine[];
  /** Legacy mock-only derived extrema. Disable for LIVE/STALE provider candles. */
  showDerivedSessionExtremes?: boolean;
  height?: number;
}

const LIVE_PRICE_STYLE: Record<
  QuoteSourceState,
  { color: string; title: string; lineStyle: number }
> = {
  LIVE: { color: "#3B9EFF", title: "Live SPY", lineStyle: 0 },
  STALE: { color: "#F5A524", title: "SPY stale", lineStyle: 2 },
  MOCK: { color: "#EF4444", title: "SPY mock", lineStyle: 2 },
};

/**
 * Reusable TradingView Lightweight Charts wrapper.
 *
 * The chart and series are created once, then updated in place. A fast quote
 * update therefore moves only the independent live-price line and does not
 * recreate the chart, reset zoom, or fabricate a forming candle.
 */
export function ChartContainer({
  candles,
  vwap,
  vwapSeries,
  livePrice,
  livePriceSourceState = "LIVE",
  openingRangeHigh,
  openingRangeLow,
  premarketHigh,
  premarketLow,
  previousClose,
  previousHigh,
  previousLow,
  additionalPriceLines,
  showDerivedSessionExtremes = true,
  height = 360,
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const referencePriceLinesRef = useRef<IPriceLine[]>([]);
  const livePriceLineRef = useRef<IPriceLine | null>(null);
  const hasFitContentRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b95a5",
        fontFamily: "var(--font-mono)",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => formatEasternTime(time),
      },
      localization: {
        timeFormatter: (time: number) => formatEasternTime(time),
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22C55E",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#22C55E",
      wickDownColor: "#EF4444",
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      color: "rgba(139,149,165,0.35)",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    const vwapLineSeries = chart.addLineSeries({
      color: "#3B9EFF",
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    vwapSeriesRef.current = vwapLineSeries;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      vwapSeriesRef.current = null;
      referencePriceLinesRef.current = [];
      livePriceLineRef.current = null;
      hasFitContentRef.current = false;
    };
  }, [height]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart) return;

    candleSeries.setData(candles.map((candle) => ({ ...candle, time: asTime(candle.time) })));
    volumeSeries.setData(
      candles.map((candle) => ({
        time: asTime(candle.time),
        value: candle.volume,
        color:
          candle.close >= candle.open
            ? "rgba(34,197,94,0.35)"
            : "rgba(239,68,68,0.35)",
      })),
    );

    if (!hasFitContentRef.current && candles.length > 0) {
      chart.timeScale().fitContent();
      hasFitContentRef.current = true;
    }
  }, [candles]);

  useEffect(() => {
    const lineSeries = vwapSeriesRef.current;
    if (!lineSeries) return;

    if (vwapSeries && vwapSeries.length > 0) {
      lineSeries.setData(
        vwapSeries.map((point) => ({ time: asTime(point.time), value: point.value })),
      );
      return;
    }

    if (vwap !== undefined) {
      lineSeries.setData(
        candles.map((candle) => ({ time: asTime(candle.time), value: vwap })),
      );
      return;
    }

    lineSeries.setData([]);
  }, [candles, vwap, vwapSeries]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    for (const line of referencePriceLinesRef.current) {
      candleSeries.removePriceLine(line);
    }
    referencePriceLinesRef.current = [];

    const addReference = (reference: ChartReferenceLine) => {
      if (!Number.isFinite(reference.price) || reference.price <= 0) return;
      referencePriceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: reference.price,
          color: reference.color,
          lineWidth: 1,
          lineStyle: reference.lineStyle ?? 2,
          title: reference.title,
        }),
      );
    };

    if (openingRangeHigh !== undefined && openingRangeHigh !== null) {
      addReference({ price: openingRangeHigh, color: "#F5A524", title: "OR High" });
    }
    if (openingRangeLow !== undefined && openingRangeLow !== null) {
      addReference({ price: openingRangeLow, color: "#F5A524", title: "OR Low" });
    }
    if (premarketHigh !== undefined) {
      addReference({ price: premarketHigh, color: "#A78BFA", title: "PM High" });
    }
    if (premarketLow !== undefined) {
      addReference({ price: premarketLow, color: "#A78BFA", title: "PM Low" });
    }

    if (showDerivedSessionExtremes && candles.length > 0) {
      addReference({
        price: Math.max(...candles.map((candle) => candle.high)),
        color: "#8b95a5",
        title: "Session High",
        lineStyle: 3,
      });
      addReference({
        price: Math.min(...candles.map((candle) => candle.low)),
        color: "#8b95a5",
        title: "Session Low",
        lineStyle: 3,
      });
    }

    if (previousClose !== undefined) {
      addReference({ price: previousClose, color: "#c9cdd6", title: "Prev Close" });
    }
    if (previousHigh !== undefined) {
      addReference({
        price: previousHigh,
        color: "#c9cdd6",
        title: "Prev High",
        lineStyle: 1,
      });
    }
    if (previousLow !== undefined) {
      addReference({
        price: previousLow,
        color: "#c9cdd6",
        title: "Prev Low",
        lineStyle: 1,
      });
    }

    for (const reference of additionalPriceLines ?? []) {
      addReference(reference);
    }
  }, [
    additionalPriceLines,
    candles,
    openingRangeHigh,
    openingRangeLow,
    premarketHigh,
    premarketLow,
    previousClose,
    previousHigh,
    previousLow,
    showDerivedSessionExtremes,
  ]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    const shouldRender = livePrice !== undefined && Number.isFinite(livePrice) && livePrice > 0;

    if (!shouldRender) {
      if (livePriceLineRef.current) {
        candleSeries.removePriceLine(livePriceLineRef.current);
        livePriceLineRef.current = null;
      }
      return;
    }

    const style = LIVE_PRICE_STYLE[livePriceSourceState];
    const options = {
      price: livePrice,
      color: style.color,
      lineWidth: 2 as const,
      lineStyle: style.lineStyle,
      axisLabelVisible: true,
      title: style.title,
    };

    if (livePriceLineRef.current) {
      livePriceLineRef.current.applyOptions(options);
    } else {
      livePriceLineRef.current = candleSeries.createPriceLine(options);
    }
  }, [livePrice, livePriceSourceState]);

  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[7%] bg-wait/[0.06]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[7%] bg-accent/[0.06]" />
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
