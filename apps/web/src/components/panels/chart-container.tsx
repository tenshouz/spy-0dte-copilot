"use client";

import type { Candle } from "@spy-copilot/shared";
import {
  ColorType,
  CrosshairMode,
  type IChartApi,
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

interface ChartContainerProps {
  candles: Candle[];
  /** Legacy scalar overlay retained only for explicitly mocked fallback data. */
  vwap?: number;
  /** Cumulative per-candle RTH VWAP series; timestamps are unix seconds at this chart boundary. */
  vwapSeries?: ChartVwapPoint[];
  openingRangeHigh?: number | null;
  openingRangeLow?: number | null;
  /** Mock reference levels — real values land once Schwab is connected. */
  previousClose?: number;
  previousHigh?: number;
  previousLow?: number;
  /** Legacy mock-only derived extrema. Disable for LIVE/STALE provider candles. */
  showDerivedSessionExtremes?: boolean;
  height?: number;
}

/**
 * Thin, reusable wrapper around TradingView Lightweight Charts. Takes plain
 * data (candles + a few reference levels) so it never needs to know about
 * Schwab, mock data, or anything upstream — panels feed it whatever they have.
 */
export function ChartContainer({
  candles,
  vwap,
  vwapSeries,
  openingRangeHigh,
  openingRangeLow,
  previousClose,
  previousHigh,
  previousLow,
  showDerivedSessionExtremes = true,
  height = 360,
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

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
        // Market time, explicitly America/New_York — never the OS timezone.
        tickMarkFormatter: (time: number) => formatEasternTime(time),
      },
      localization: {
        timeFormatter: (time: number) => formatEasternTime(time),
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22C55E",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#22C55E",
      wickDownColor: "#EF4444",
    });
    candleSeries.setData(candles.map((c) => ({ ...c, time: asTime(c.time) })));

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      color: "rgba(139,149,165,0.35)",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volumeSeries.setData(
      candles.map((c) => ({
        time: asTime(c.time),
        value: c.volume,
        color: c.close >= c.open ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
      })),
    );

    if (vwapSeries && vwapSeries.length > 0) {
      const line = chart.addLineSeries({ color: "#3B9EFF", lineWidth: 2 });
      line.setData(vwapSeries.map((point) => ({ time: asTime(point.time), value: point.value })));
    } else if (vwap !== undefined) {
      const line = chart.addLineSeries({ color: "#3B9EFF", lineWidth: 2 });
      line.setData(candles.map((c) => ({ time: asTime(c.time), value: vwap })));
    }

    if (openingRangeHigh) {
      candleSeries.createPriceLine({
        price: openingRangeHigh,
        color: "#F5A524",
        lineWidth: 1,
        lineStyle: 2,
        title: "OR High",
      });
    }
    if (openingRangeLow) {
      candleSeries.createPriceLine({
        price: openingRangeLow,
        color: "#F5A524",
        lineWidth: 1,
        lineStyle: 2,
        title: "OR Low",
      });
    }

    if (showDerivedSessionExtremes && candles.length > 0) {
      const sessionHigh = Math.max(...candles.map((c) => c.high));
      const sessionLow = Math.min(...candles.map((c) => c.low));
      candleSeries.createPriceLine({
        price: sessionHigh,
        color: "#8b95a5",
        lineWidth: 1,
        lineStyle: 3,
        title: "Session High",
      });
      candleSeries.createPriceLine({
        price: sessionLow,
        color: "#8b95a5",
        lineWidth: 1,
        lineStyle: 3,
        title: "Session Low",
      });
    }

    if (previousClose) {
      candleSeries.createPriceLine({
        price: previousClose,
        color: "#c9cdd6",
        lineWidth: 1,
        lineStyle: 2,
        title: "Prev Close",
      });
    }
    if (previousHigh) {
      candleSeries.createPriceLine({
        price: previousHigh,
        color: "#c9cdd6",
        lineWidth: 1,
        lineStyle: 1,
        title: "Prev High",
      });
    }
    if (previousLow) {
      candleSeries.createPriceLine({
        price: previousLow,
        color: "#c9cdd6",
        lineWidth: 1,
        lineStyle: 1,
        title: "Prev Low",
      });
    }

    chart.timeScale().fitContent();

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
    };
  }, [
    candles,
    vwap,
    vwapSeries,
    openingRangeHigh,
    openingRangeLow,
    previousClose,
    previousHigh,
    previousLow,
    showDerivedSessionExtremes,
    height,
  ]);

  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[7%] bg-wait/[0.06]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[7%] bg-accent/[0.06]" />
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
