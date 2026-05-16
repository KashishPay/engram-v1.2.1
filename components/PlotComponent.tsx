import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface PlotData {
    x: number;
    y: number;
}

interface PlotComponentProps {
    data: PlotData[];
    title: string;
    xAxisLabel?: string;
    yAxisLabel?: string;
}

export const PlotComponent: React.FC<PlotComponentProps> = ({ data, title, xAxisLabel, yAxisLabel }) => {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!svgRef.current || data.length === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = 400;
        const height = 330;
        const margin = { top: 20, right: 20, bottom: 50, left: 50 };

        const xExtent = d3.extent(data, d => d.x) as [number, number];
        const yExtent = d3.extent(data, d => d.y) as [number, number];
        
        // Calculate dynamic padding (e.g., 10% of the range)
        const xPadding = (xExtent[1] - xExtent[0]) * 0.1;
        const yPadding = (yExtent[1] - yExtent[0]) * 0.1;

        // Expand domain to include negative space and add dynamic padding
        const xDomain: [number, number] = [Math.min(0, xExtent[0] - xPadding), Math.max(0, xExtent[1] + xPadding)];
        const yDomain: [number, number] = [Math.min(0, yExtent[0] - yPadding), Math.max(0, yExtent[1] + yPadding)];

        const x = d3.scaleLinear()
            .domain(xDomain)
            .range([margin.left, width - margin.right]);

        const y = d3.scaleLinear()
            .domain(yDomain)
            .range([height - margin.bottom, margin.top]);

        // X-axis
        svg.append('g')
            .attr('transform', `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("~s")))
            .selectAll("text")
            .style("text-anchor", "middle")
            .attr("dy", "1em");
            
        // X-axis Label
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height - 10) // Positioned relative to bottom
            .attr("fill", "black")
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .text(xAxisLabel || "Time (s)");

        // Y-axis
        svg.append('g')
            .attr('transform', `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).ticks(5));
            
        // Y-axis Label
        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 15) // Positioned relative to left edge
            .attr("x", -height / 2)
            .attr("fill", "black")
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .text(yAxisLabel || "Voltage (V)");

        // Origin lines (Zero-crossings)
        if (yDomain[0] < 0 && yDomain[1] > 0) {
            svg.append('line')
                .attr('x1', margin.left)
                .attr('x2', width - margin.right)
                .attr('y1', y(0))
                .attr('y2', y(0))
                .attr('stroke', 'rgba(0,0,0,0.3)')
                .attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '4,4');
        }

        if (xDomain[0] < 0 && xDomain[1] > 0) {
            svg.append('line')
                .attr('x1', x(0))
                .attr('x2', x(0))
                .attr('y1', margin.top)
                .attr('y2', height - margin.bottom)
                .attr('stroke', 'rgba(0,0,0,0.3)')
                .attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '4,4');
        }

        const line = d3.line<PlotData>()
            .x(d => x(d.x))
            .y(d => y(d.y));

        svg.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', 'steelblue')
            .attr('stroke-width', 1.5)
            .attr('d', line);
            
    }, [data]);

    return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm my-4 touch-pan-x touch-pan-y">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">{title}</h3>
            <svg ref={svgRef} viewBox="0 0 400 330" className="w-full h-auto" />
        </div>
    );
};
