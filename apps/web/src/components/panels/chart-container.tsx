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

interface ChartContainerProps {
  candles: Candle[];
  vwap?: number;
  openingRangeHigh?: number | null;
  openingRangeLow?: number | null;
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
  openingRangeHigh,
  openingRangeLow,
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
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
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

    if (vwap) {
      const vwapSeries = chart.addLineSeries({ color: "#3B9EFF", lineWidth: 2 });
      vwapSeries.setData(candles.map((c) => ({ time: asTime(c.time), value: vwap })));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, vwap, openingRangeHigh, openingRangeLow, height]);

  return <div ref={containerRef} className="w-full" />;
}
