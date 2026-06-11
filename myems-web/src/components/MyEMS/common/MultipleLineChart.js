import React, { useState, useContext, useEffect } from 'react';
import { Row, Col, Card, CardBody } from 'reactstrap';
import { CheckPicker } from 'rsuite';
import { rgbaColor, themeColors, isIterableArray, getGrays } from '../../../helpers/utils';
import AppContext from '../../../context/Context';
import ReactEchartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/lib/echarts';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  ToolboxComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent
} from 'echarts/components';

echarts.use([LineChart, GridComponent, ToolboxComponent, DataZoomComponent, MarkLineComponent, MarkPointComponent]);

const chartColors = ['#2c7be5', '#00d27a', '#27bcfd', '#f5803e', '#e63757'];

const formatValue = (value, formatter) => {
  if (typeof formatter === 'function') {
    return formatter(value);
  }

  return value;
};

const MultipleLineChart = ({
  reportingTitle,
  baseTitle,
  labels,
  data,
  options,
  initialValues,
  valueFormatter,
  yAxes,
  seriesAxisMap
}) => {
  const { isDark } = useContext(AppContext);
  const [values, setValues] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [lineLabels, setLineLabels] = useState([]);
  const [interval, setInterval] = useState(0);

  const handleChange = arr => {
    if (!isIterableArray(arr) || arr.length < 1) {
      return;
    }
    setValues(arr);
  };

  useEffect(() => {
    const getDefaultValues = () => {
      const preferredValues = isIterableArray(initialValues) && initialValues.length > 0 ? initialValues : [];
      const fallbackValues =
        preferredValues.length > 0
          ? preferredValues
          : isIterableArray(options) && options.length > 0
          ? [options[0].value]
          : ['a0'];

      return fallbackValues.filter(value => options[Number(String(value).slice(1))] && data[value] && labels[value]);
    };

    const buildSeriesNode = (key, colorIndex) => ({
      data: data[key],
      type: 'line',
      smooth: true,
      yAxisIndex: seriesAxisMap && Number.isInteger(seriesAxisMap[key]) ? seriesAxisMap[key] : 0,
      name: options[Number(String(key).slice(1))] ? options[Number(String(key).slice(1))].label : '',
      itemStyle: {
        color: chartColors[colorIndex % chartColors.length]
      },
      lineStyle: {
        color: chartColors[colorIndex % chartColors.length]
      },
      markPoint: {
        data: [
          {
            type: 'max',
            name: 'Max Value'
          },
          {
            type: 'min',
            name: 'Min Value'
          }
        ],
        label: {
          color: rgbaColor(isDark ? '#fff' : '#000', 0.8),
          formatter: params => formatValue(params.value, valueFormatter)
        },
        itemStyle: {
          color: chartColors[colorIndex % chartColors.length]
        }
      },
      markLine: {
        lineStyle: {
          color: chartColors[colorIndex % chartColors.length]
        },
        label: {
          color: rgbaColor(isDark ? '#fff' : '#000', 0.8),
          formatter: params => formatValue(params.value, valueFormatter)
        },
        data: [
          {
            type: 'average',
            name: 'Average Value'
          }
        ]
      }
    });

    const validValues = values.filter(value => options[Number(String(value).slice(1))] && data[value] && labels[value]);
    const nextValues = validValues.length > 0 ? validValues : getDefaultValues();

    if (nextValues.length < 1) {
      setNodes([]);
      setLineLabels([]);
      setInterval(0);
      if (values.length > 0) {
        setValues([]);
      }
      return;
    }

    if (nextValues.join('|') !== values.join('|')) {
      setValues(nextValues);
      return;
    }

    setNodes(nextValues.map((value, index) => buildSeriesNode(value, index)));
    setLineLabels(labels[nextValues[0]] || []);
    setInterval(labels[nextValues[0]] ? parseInt(labels[nextValues[0]].length / 20) : 0);
  }, [data, initialValues, isDark, labels, options, seriesAxisMap, valueFormatter, values]);

  const getOption = () => {
    const resolvedYAxis =
      isIterableArray(yAxes) && yAxes.length > 0
        ? yAxes.map(axis => ({
            type: 'value',
            splitLine: { show: false },
            name: axis.name || '',
            position: axis.position || 'left',
            axisLabel: {
              color: rgbaColor(isDark ? '#fff' : '#000', 0.8),
              formatter: value => {
                if (typeof axis.valueFormatter === 'function') {
                  return axis.valueFormatter(value);
                }

                return formatValue(value, valueFormatter);
              }
            },
            axisLine: {
              lineStyle: {
                color: rgbaColor(isDark ? '#fff' : '#000', 0.8)
              }
            },
            nameTextStyle: {
              color: rgbaColor(isDark ? '#fff' : '#000', 0.8)
            }
          }))
        : {
            type: 'value',
            splitLine: { show: false },
            axisLabel: {
              color: rgbaColor(isDark ? '#fff' : '#000', 0.8),
              formatter: value => formatValue(value, valueFormatter)
            },
            axisLine: {
              lineStyle: {
                color: rgbaColor(isDark ? '#fff' : '#000', 0.8)
              }
            }
          };

    return {
      legend: {
        orient: 'horizontal',
        textStyle: {
          color: rgbaColor(isDark ? '#fff' : '#000', 0.8)
        }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: getGrays(isDark)[100],
        borderColor: getGrays(isDark)[300],
        color: isDark ? themeColors.light : themeColors.dark,
        formatter: params => {
          if (!isIterableArray(params) || params.length < 1) {
            return '';
          }

          return [params[0].axisValueLabel || params[0].axisValue]
            .concat(params.map(item => `${item.marker}${item.seriesName}: ${formatValue(item.value, valueFormatter)}`))
            .join('<br/>');
        }
      },
      grid: {
        left: '5%',
        right: '5%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: lineLabels ? lineLabels : ['0'],
        axisLabel: {
          interval: interval,
          color: rgbaColor(isDark ? '#fff' : '#000', 0.8),
          rotate: 30
        },
        axisLine: {
          lineStyle: {
            color: rgbaColor(isDark ? '#fff' : '#000', 0.8)
          }
        }
      },
      yAxis: resolvedYAxis,
      series: nodes,
      toolbox: {
        right: 10,
        feature: {},
        show: false
      },
      dataZoom: [
        {
          id: 'dataZoomX',
          type: 'inside',
          xAxisIndex: [0],
          filterMode: 'filter'
        }
      ]
    };
  };

  return (
    <Card className="mb-3">
      <CardBody className="rounded-soft">
        <Row className="text-white align-items-center no-gutters">
          <Col>
            <h5 className="text-lightSlateGray mb-0">{reportingTitle}</h5>
            <p className="fs--1 font-weight-semi-bold">{baseTitle}</p>
          </Col>
          {options[0] && isIterableArray(options) && (
            <Col xs="auto" className="d-none d-sm-block">
              <CheckPicker
                data={options}
                value={values}
                appearance="default"
                placeholder="select"
                searchable={false}
                countable={false}
                onChange={handleChange}
                style={{ width: 224, borderRadius: '.25rem' }}
              />
            </Col>
          )}
        </Row>
        <ReactEchartsCore
          echarts={echarts}
          notMerge={true}
          option={getOption()}
          style={{ width: '100%', height: 318 }}
        />
      </CardBody>
    </Card>
  );
};

export default MultipleLineChart;
