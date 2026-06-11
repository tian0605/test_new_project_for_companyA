import React, { Fragment, useContext, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  Col,
  CustomInput,
  Form,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
  Table
} from 'reactstrap';
import CountUp from 'react-countup';
import Cascader from 'rc-cascader';
import moment from 'moment';
import { endOfDay } from 'date-fns';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { withTranslation } from 'react-i18next';
import ReactEchartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/lib/echarts';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import AppContext from '../../../context/Context';
import { APIBaseURL, settings } from '../../../config';
import {
  checkEmpty,
  createCookie,
  getCookieValue,
  getGrays,
  handleAPIError,
  rgbaColor,
  themeColors
} from '../../../helpers/utils';
import withRedirect from '../../../hoc/withRedirect';
import ButtonIcon from '../../common/ButtonIcon';
import CardSummary from '../common/CardSummary';
import DateRangePickerWrapper from '../common/DateRangePickerWrapper';
import blankPage from '../../../assets/img/generic/blank-page.png';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer]);

const periodTypeOptions = [
  { value: 'yearly', label: 'Yearly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' }
];

const SpaceEvaluation = ({ setRedirect, setRedirectUrl, t }) => {
  const currentMoment = moment();
  const { language, isDark } = useContext(AppContext);

  const [selectedSpaceName, setSelectedSpaceName] = useState(undefined);
  const [selectedSpaceID, setSelectedSpaceID] = useState(undefined);
  const [products, setProducts] = useState([]);
  const [selectedProductID, setSelectedProductID] = useState(undefined);
  const [periodType, setPeriodType] = useState('daily');
  const [cascaderOptions, setCascaderOptions] = useState(undefined);
  const [reportingPeriodDateRange, setReportingPeriodDateRange] = useState([
    currentMoment
      .clone()
      .startOf('month')
      .toDate(),
    currentMoment.toDate()
  ]);

  const [submitButtonDisabled, setSubmitButtonDisabled] = useState(true);
  const [spinnerHidden, setSpinnerHidden] = useState(true);
  const [exportButtonHidden, setExportButtonHidden] = useState(true);
  const [resultDataHidden, setResultDataHidden] = useState(true);
  const [report, setReport] = useState(undefined);
  const [excelBytesBase64, setExcelBytesBase64] = useState(undefined);
  const [expandedAdvice, setExpandedAdvice] = useState({});
  const [trendDetailsVisible, setTrendDetailsVisible] = useState(false);

  useEffect(() => {
    const isLoggedIn = getCookieValue('is_logged_in');
    const userName = getCookieValue('user_name');
    const userDisplayName = getCookieValue('user_display_name');
    const userUUID = getCookieValue('user_uuid');
    const token = getCookieValue('token');
    if (checkEmpty(isLoggedIn) || checkEmpty(token) || checkEmpty(userUUID) || !isLoggedIn) {
      setRedirectUrl(`/authentication/basic/login`);
      setRedirect(true);
    } else {
      createCookie('is_logged_in', true, settings.cookieExpireTime);
      createCookie('user_name', userName, settings.cookieExpireTime);
      createCookie('user_display_name', userDisplayName, settings.cookieExpireTime);
      createCookie('user_uuid', userUUID, settings.cookieExpireTime);
      createCookie('token', token, settings.cookieExpireTime);
    }
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const isLoggedIn = getCookieValue('is_logged_in');
      if (isLoggedIn === null || !isLoggedIn) {
        setRedirectUrl(`/authentication/basic/login`);
        setRedirect(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [setRedirect, setRedirectUrl]);

  useEffect(() => {
    let isResponseOK = false;
    fetch(APIBaseURL + '/spaces/tree', {
      method: 'GET',
      headers: {
        'Content-type': 'application/json',
        'User-UUID': getCookieValue('user_uuid'),
        Token: getCookieValue('token')
      },
      body: null
    })
      .then(response => {
        if (response.ok) {
          isResponseOK = true;
          setSubmitButtonDisabled(false);
        }
        return response.json();
      })
      .then(json => {
        if (isResponseOK) {
          const options = JSON.parse(
            JSON.stringify([json])
              .split('"id":')
              .join('"value":')
              .split('"name":')
              .join('"label":')
          );
          setCascaderOptions(options);
          setSelectedSpaceName([options[0]].map(o => o.label));
          const rootSpaceID = [options[0]].map(o => o.value)[0];
          setSelectedSpaceID(rootSpaceID);
          loadSpaceProducts(rootSpaceID, true);
        } else {
          handleAPIError(json, setRedirect, setRedirectUrl, t, toast);
        }
      })
      .catch(err => console.log(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const dateRangePickerLocale = {
    sunday: t('sunday'),
    monday: t('monday'),
    tuesday: t('tuesday'),
    wednesday: t('wednesday'),
    thursday: t('thursday'),
    friday: t('friday'),
    saturday: t('saturday'),
    ok: t('ok'),
    today: t('today'),
    yesterday: t('yesterday'),
    hours: t('hours'),
    minutes: t('minutes'),
    seconds: t('seconds'),
    last7Days: t('last7Days'),
    formattedMonthPattern: 'yyyy-MM-dd'
  };
  const dateRangePickerStyle = { display: 'block', zIndex: 10 };
  const labelClasses = 'ls text-uppercase text-600 font-weight-semi-bold mb-0';

  const loadSpaceProducts = (spaceID, shouldLoadData = false) => {
    let isResponseOK = false;
    fetch(APIBaseURL + '/spaces/' + spaceID + '/products', {
      method: 'GET',
      headers: {
        'Content-type': 'application/json',
        'User-UUID': getCookieValue('user_uuid'),
        Token: getCookieValue('token')
      },
      body: null
    })
      .then(response => {
        if (response.ok) {
          isResponseOK = true;
        }
        return response.json();
      })
      .then(json => {
        if (isResponseOK) {
          setProducts(json);
          const nextProductID = json.length > 0 ? json[0].id : undefined;
          setSelectedProductID(nextProductID);
          if (shouldLoadData && nextProductID) {
            loadData(spaceID, nextProductID);
          } else if (json.length === 0) {
            finalizeLoadState(false, false);
            setReport(undefined);
            setExcelBytesBase64(undefined);
          }
        } else {
          setProducts([]);
          setSelectedProductID(undefined);
          handleAPIError(json, setRedirect, setRedirectUrl, t, toast);
        }
      })
      .catch(err => console.log(err));
  };

  const onSpaceCascaderChange = (value, selectedOptions) => {
    setSelectedSpaceName(selectedOptions.map(o => o.label).join('/'));
    const spaceID = value[value.length - 1];
    setSelectedSpaceID(spaceID);
    setReport(undefined);
    loadSpaceProducts(spaceID);
  };

  const onReportingPeriodChange = dateRange => {
    if (dateRange == null) {
      setReportingPeriodDateRange([null, null]);
    } else {
      if (moment(dateRange[1]).format('HH:mm:ss') === '00:00:00') {
        dateRange[1] = endOfDay(dateRange[1]);
      }
      setReportingPeriodDateRange([dateRange[0], dateRange[1]]);
    }
  };

  const finalizeLoadState = (hasResultData, hasExportData = false) => {
    setSubmitButtonDisabled(false);
    setSpinnerHidden(true);
    setExportButtonHidden(!hasExportData);
    setResultDataHidden(!hasResultData);
  };

  const handleSubmit = e => {
    e.preventDefault();
    if (!selectedProductID) {
      toast.error(t('Please Select Product'));
      return;
    }
    loadData(selectedSpaceID, selectedProductID);
  };

  const loadData = (spaceID, productID = selectedProductID) => {
    setSubmitButtonDisabled(true);
    setSpinnerHidden(false);
    setExportButtonHidden(true);
    setResultDataHidden(true);
    setReport(undefined);
    setExcelBytesBase64(undefined);

    let isResponseOK = false;
    fetch(
      APIBaseURL +
        '/reports/spaceevaluation?' +
        'spaceid=' +
        spaceID +
        '&productid=' +
        productID +
        '&periodtype=' +
        periodType +
        '&reportingperiodstartdatetime=' +
        moment(reportingPeriodDateRange[0]).format('YYYY-MM-DDTHH:mm:ss') +
        '&reportingperiodenddatetime=' +
        moment(reportingPeriodDateRange[1]).format('YYYY-MM-DDTHH:mm:ss') +
        '&language=' +
        language,
      {
        method: 'GET',
        headers: {
          'Content-type': 'application/json',
          'User-UUID': getCookieValue('user_uuid'),
          Token: getCookieValue('token')
        },
        body: null
      }
    )
      .then(response => {
        if (response.ok) {
          isResponseOK = true;
        }
        return response.json();
      })
      .then(json => {
        if (isResponseOK) {
          setReport(json);
          setExcelBytesBase64(json['excel_bytes_base64']);
          finalizeLoadState(true, !!json['excel_bytes_base64']);
        } else {
          finalizeLoadState(false, false);
          handleAPIError(json, setRedirect, setRedirectUrl, t, toast);
        }
      })
      .catch(err => {
        finalizeLoadState(false, false);
        console.log(err);
      });
  };

  const handleExport = e => {
    e.preventDefault();
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const fileName = 'SpaceEvaluation.xlsx';
    const fileUrl = 'data:' + mimeType + ';base64,' + excelBytesBase64;
    fetch(fileUrl)
      .then(response => response.blob())
      .then(blob => {
        const link = window.document.createElement('a');
        link.href = window.URL.createObjectURL(blob, { type: mimeType });
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
  };

  const formatNumber = (value, decimals = 4) => {
    const convertedValue = Number(value);
    return Number.isFinite(convertedValue) ? convertedValue.toFixed(decimals) : null;
  };

  const formatPercent = value => {
    const convertedValue = Number(value);
    return Number.isFinite(convertedValue) ? `${Math.abs(convertedValue * 100).toFixed(1)}%` : null;
  };

  const formatChartValue = (value, decimals = 2) => {
    const convertedValue = Number(value);
    return Number.isFinite(convertedValue) ? convertedValue.toFixed(decimals) : '-';
  };

  const getAdviceItems = evaluation => {
    const normalizeAdviceItem = item =>
      String(item)
        .trim()
        .replace(/^\s*(?:\d+[.、)]|[一二三四五六七八九十]+[、)]|[-*•])\s*/, '');

    if (!evaluation) {
      return [];
    }

    if (Array.isArray(evaluation.advice_list) && evaluation.advice_list.length > 0) {
      return evaluation.advice_list.map(normalizeAdviceItem).filter(Boolean);
    }

    if (!evaluation.advice_text) {
      return [];
    }

    return String(evaluation.advice_text)
      .replace(/\r/g, '')
      .split('\n')
      .map(normalizeAdviceItem)
      .filter(Boolean);
  };

  const formatTrendLabel = value => {
    if (!value) {
      return '-';
    }

    const parsedMoment = moment(value);
    if (!parsedMoment.isValid()) {
      return value;
    }

    if (periodType === 'yearly') {
      return parsedMoment.format('YYYY');
    }

    if (periodType === 'monthly') {
      return parsedMoment.format('YYYY-MM');
    }

    if (periodType === 'weekly') {
      return parsedMoment.format('MM-DD');
    }

    return parsedMoment.format('MM-DD');
  };

  const toggleAdvice = metricCode => {
    setExpandedAdvice(currentValue => ({
      ...currentValue,
      [metricCode]: !currentValue[metricCode]
    }));
  };

  const getGapDescription = evaluation => {
    if (!evaluation || evaluation.gap_rate === null || evaluation.gap_rate === undefined) {
      return t('No Benchmark Comparison');
    }

    const percent = formatPercent(evaluation.gap_rate);
    if (!percent) {
      return t('No Benchmark Comparison');
    }

    if (Number(evaluation.gap_rate) > 0) {
      return `${t('Above Benchmark')} ${percent}`;
    }

    if (Number(evaluation.gap_rate) < 0) {
      return `${t('Below Benchmark')} ${percent}`;
    }

    return t('At Benchmark');
  };

  const getComparisonBarWidth = evaluation => {
    if (!evaluation || evaluation.gap_rate === null || evaluation.gap_rate === undefined) {
      return 0;
    }

    const ratio = Math.abs(Number(evaluation.gap_rate || 0));
    if (!Number.isFinite(ratio)) {
      return 0;
    }

    return Math.min(ratio * 300, 100);
  };

  const getComparisonBarColor = evaluation => {
    if (!evaluation) {
      return 'secondary';
    }

    if (evaluation.highlight_style === 'danger') {
      return 'danger';
    }

    if (evaluation.highlight_style === 'success') {
      return 'success';
    }

    if (evaluation.highlight_style === 'warning') {
      return 'warning';
    }

    return 'info';
  };

  const getTrendChartOption = () => {
    const grays = getGrays(isDark);
    const labels = trendChartLabels.a0 || [];

    return {
      color: ['#2c7be5', '#00a86b', '#e55353'],
      legend: {
        top: 0,
        textStyle: {
          color: rgbaColor(isDark ? '#fff' : '#000', 0.8)
        },
        data: [
          t('Production'),
          t('Per Unit Product Energy Consumption'),
          t('Per Unit Product Carbon Dioxide Emissions')
        ]
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: grays.white || grays[100],
        borderColor: grays['300'],
        borderWidth: 1,
        textStyle: {
          color: isDark ? themeColors.light : themeColors.dark
        },
        formatter: params => {
          if (!Array.isArray(params) || params.length < 1) {
            return '';
          }

          return [params[0].axisValueLabel || params[0].axisValue]
            .concat(params.map(item => `${item.marker}${item.seriesName}: ${formatChartValue(item.value, 2)}`))
            .join('<br/>');
        }
      },
      grid: {
        left: '6%',
        right: '8%',
        top: 48,
        bottom: 56,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: labels,
        axisLabel: {
          rotate: 30,
          color: rgbaColor(isDark ? '#fff' : '#000', 0.8)
        },
        axisLine: {
          lineStyle: {
            color: rgbaColor(isDark ? '#fff' : '#000', 0.3)
          }
        }
      },
      yAxis: [
        {
          type: 'value',
          name: t('Production'),
          position: 'left',
          splitLine: {
            lineStyle: {
              color: rgbaColor(isDark ? '#fff' : '#000', 0.08)
            }
          },
          axisLabel: {
            color: rgbaColor(isDark ? '#fff' : '#000', 0.8),
            formatter: value => formatChartValue(value, 2)
          },
          axisLine: {
            lineStyle: {
              color: '#2c7be5'
            }
          },
          nameTextStyle: {
            color: '#2c7be5'
          }
        },
        {
          type: 'value',
          name: t('Energy Intensity'),
          position: 'right',
          splitLine: { show: false },
          axisLabel: {
            color: rgbaColor(isDark ? '#fff' : '#000', 0.8),
            formatter: value => formatChartValue(value, 2)
          },
          axisLine: {
            lineStyle: {
              color: '#00a86b'
            }
          },
          nameTextStyle: {
            color: '#00a86b'
          }
        }
      ],
      series: [
        {
          name: t('Production'),
          type: 'line',
          smooth: true,
          showSymbol: true,
          symbolSize: 6,
          yAxisIndex: 0,
          data: trendChartData.a0
        },
        {
          name: t('Per Unit Product Energy Consumption'),
          type: 'line',
          smooth: true,
          showSymbol: true,
          symbolSize: 6,
          yAxisIndex: 1,
          data: trendChartData.a1
        },
        {
          name: t('Per Unit Product Carbon Dioxide Emissions'),
          type: 'line',
          smooth: true,
          showSymbol: true,
          symbolSize: 6,
          yAxisIndex: 1,
          data: trendChartData.a2
        }
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0],
          filterMode: 'filter'
        }
      ]
    };
  };

  const getBadgeColor = evaluation => {
    if (!evaluation || evaluation.matched === false) {
      return 'secondary';
    }
    if (evaluation.highlight_style === 'danger') {
      return 'danger';
    }
    if (evaluation.highlight_style === 'warning') {
      return 'warning';
    }
    if (evaluation.highlight_style === 'success') {
      return 'success';
    }
    return evaluation.is_compliant ? 'success' : 'secondary';
  };

  const summary = report ? report.summary || {} : {};
  const product = report ? report.product || {} : {};
  const evaluations = report ? report.evaluations || [] : [];
  const trends = report ? report.trends || [] : [];
  const nonZeroTrends = trends.filter(trend => {
    const production = Number(trend.production || 0);
    const energyIntensity = Number(trend.unit_comprehensive_energy_tce_per_t);
    const carbonIntensity = Number(trend.unit_carbon_tco2_per_t);
    return production !== 0 || Number.isFinite(energyIntensity) || Number.isFinite(carbonIntensity);
  });
  const displayedTrends = nonZeroTrends.length > 0 ? nonZeroTrends : trends;
  const trendChartLabels = {
    a0: displayedTrends.map(trend => formatTrendLabel(trend.datetime)),
    a1: displayedTrends.map(trend => formatTrendLabel(trend.datetime)),
    a2: displayedTrends.map(trend => formatTrendLabel(trend.datetime))
  };
  const trendChartData = {
    a0: displayedTrends.map(trend => Number(trend.production || 0)),
    a1: displayedTrends.map(trend => Number(trend.unit_comprehensive_energy_tce_per_t || 0)),
    a2: displayedTrends.map(trend => Number(trend.unit_carbon_tco2_per_t || 0))
  };
  const compliantEvaluations = evaluations.filter(evaluation => evaluation.is_compliant === true);
  const nonCompliantEvaluations = evaluations.filter(evaluation => evaluation.is_compliant === false);
  const priorityEvaluation = nonCompliantEvaluations[0] || evaluations[0];
  const overallTone = nonCompliantEvaluations.length > 0 ? 'warning' : 'success';
  const overallTitle = nonCompliantEvaluations.length > 0 ? t('Needs Improvement') : t('Good Performance');
  const overallMetricName = priorityEvaluation
    ? t(priorityEvaluation.metric_name || priorityEvaluation.metric_code)
    : null;
  const unitEnergyEvaluation = evaluations.find(
    evaluation => evaluation.metric_code === 'unit_comprehensive_energy_tce_per_t'
  );
  const unitCarbonEvaluation = evaluations.find(evaluation => evaluation.metric_code === 'unit_carbon_tco2_per_t');
  const reportSummaryVisible = evaluations.length > 0;

  return (
    <Fragment>
      <Breadcrumb>
        <BreadcrumbItem>{t('Space Data')}</BreadcrumbItem>
        <BreadcrumbItem active onClick={() => window.location.reload()}>
          <Link to="/space/evaluation">{t('Evaluation Report')}</Link>
        </BreadcrumbItem>
      </Breadcrumb>
      <Card className="bg-light mb-3">
        <CardBody className="p-3">
          <Form onSubmit={handleSubmit}>
            <Row form>
              <Col xs={6} sm={3}>
                <FormGroup className="form-group">
                  <Label className={labelClasses} for="space">
                    {t('Space')}
                  </Label>
                  <br />
                  <Cascader
                    options={cascaderOptions}
                    onChange={onSpaceCascaderChange}
                    changeOnSelect
                    expandTrigger="hover"
                  >
                    <Input bsSize="sm" value={selectedSpaceName || ''} readOnly />
                  </Cascader>
                </FormGroup>
              </Col>
              <Col xs="auto">
                <FormGroup>
                  <Label className={labelClasses} for="product">
                    {t('Product')}
                  </Label>
                  <CustomInput
                    type="select"
                    id="product"
                    name="product"
                    bsSize="sm"
                    value={selectedProductID || ''}
                    onChange={({ target }) => setSelectedProductID(Number(target.value) || undefined)}
                  >
                    {products.length === 0 ? (
                      <option value="">{t('No Product Available')}</option>
                    ) : (
                      products.map(product => (
                        <option value={product.id} key={product.id}>
                          {product.name}
                        </option>
                      ))
                    )}
                  </CustomInput>
                </FormGroup>
              </Col>
              <Col xs="auto">
                <FormGroup>
                  <Label className={labelClasses} for="periodType">
                    {t('Period Types')}
                  </Label>
                  <CustomInput
                    type="select"
                    id="periodType"
                    name="periodType"
                    bsSize="sm"
                    defaultValue="daily"
                    onChange={({ target }) => setPeriodType(target.value)}
                  >
                    {periodTypeOptions.map(periodType => (
                      <option value={periodType.value} key={periodType.value}>
                        {t(periodType.label)}
                      </option>
                    ))}
                  </CustomInput>
                </FormGroup>
              </Col>
              <Col xs={6} sm={3}>
                <FormGroup className="form-group">
                  <Label className={labelClasses} for="reportingPeriodDateRangePicker">
                    {t('Reporting Period')}
                  </Label>
                  <br />
                  <DateRangePickerWrapper
                    id="reportingPeriodDateRangePicker"
                    format="yyyy-MM-dd HH:mm:ss"
                    value={reportingPeriodDateRange}
                    onChange={onReportingPeriodChange}
                    size="sm"
                    style={dateRangePickerStyle}
                    onClean={() => setReportingPeriodDateRange([null, null])}
                    locale={dateRangePickerLocale}
                    placeholder={t('Select Date Range')}
                  />
                </FormGroup>
              </Col>
              <Col xs="auto">
                <FormGroup>
                  <br />
                  <ButtonGroup id="submit">
                    <Button size="sm" color="success" disabled={submitButtonDisabled}>
                      {t('Submit')}
                    </Button>
                  </ButtonGroup>
                </FormGroup>
              </Col>
              <Col xs="auto">
                <FormGroup>
                  <br />
                  <Spinner color="primary" hidden={spinnerHidden} />
                </FormGroup>
              </Col>
              <Col xs="auto">
                <br />
                <ButtonIcon
                  icon="external-link-alt"
                  transform="shrink-3 down-2"
                  color="falcon-default"
                  size="sm"
                  hidden={exportButtonHidden}
                  onClick={handleExport}
                >
                  {t('Export')}
                </ButtonIcon>
              </Col>
            </Row>
          </Form>
        </CardBody>
      </Card>

      <div
        className="blank-page-image-container"
        style={{ visibility: resultDataHidden ? 'visible' : 'hidden', display: resultDataHidden ? '' : 'none' }}
      >
        <img className="img-fluid" src={blankPage} alt="" />
      </div>

      <div style={{ visibility: resultDataHidden ? 'hidden' : 'visible', display: resultDataHidden ? 'none' : '' }}>
        {reportSummaryVisible ? (
          <Alert color={overallTone} className="d-flex align-items-start mb-2 shadow-sm border-0">
            <div className="mr-3">
              <Badge color={overallTone}>{overallTitle}</Badge>
            </div>
            <div className="flex-1">
              <div className="font-weight-semi-bold mb-1">{t('Overall Conclusion')}</div>
              <div className="text-700">
                {t('Non-compliant Items')}: {nonCompliantEvaluations.length}
                <span className="mx-2 text-500">|</span>
                {t('Compliant Items')}: {compliantEvaluations.length}
                {overallMetricName ? (
                  <Fragment>
                    <span className="mx-2 text-500">|</span>
                    {t('Priority Focus')}: {overallMetricName}
                  </Fragment>
                ) : null}
              </div>
            </div>
          </Alert>
        ) : null}

        <Row className="mx-n1 align-items-stretch mb-2">
          <Col sm={6} lg={4} xl className="d-flex px-1" style={{ flex: '1 1 20%' }}>
            <CardSummary
              rate=""
              title={t('Production') + ' (' + (product.unit || '') + ')'}
              color="success"
              cardClassName="bg-white"
              bodyClassName="py-2"
              titleClassName="mb-1"
              valueClassName="fs-2 text-800"
            >
              <CountUp
                end={Number(summary.total_production || 0)}
                duration={2}
                separator=","
                decimal="."
                decimals={2}
              />
            </CardSummary>
          </Col>
          <Col sm={6} lg={4} xl className="d-flex px-1" style={{ flex: '1 1 20%' }}>
            <CardSummary
              rate=""
              title={t('Ton of Standard Coal') + ' (TCE)'}
              color="info"
              cardClassName="bg-white"
              bodyClassName="py-2"
              titleClassName="mb-1"
              valueClassName="fs-2 text-info"
            >
              <CountUp
                end={Number(summary.total_energy_kgce || 0) / 1000}
                duration={2}
                separator=","
                decimal="."
                decimals={2}
              />
            </CardSummary>
          </Col>
          <Col sm={6} lg={4} xl className="d-flex px-1" style={{ flex: '1 1 20%' }}>
            <CardSummary
              rate=""
              title={t('Ton of Carbon Dioxide Emissions') + ' (TCO2E)'}
              color="co2"
              cardClassName="bg-white"
              bodyClassName="py-2"
              titleClassName="mb-1"
              valueClassName="fs-2 text-800"
            >
              <CountUp
                end={Number(summary.total_carbon_kgco2e || 0) / 1000}
                duration={2}
                separator=","
                decimal="."
                decimals={2}
              />
            </CardSummary>
          </Col>
          <Col sm={6} lg={6} xl className="d-flex px-1" style={{ flex: '1 1 20%' }}>
            <CardSummary
              rate={unitEnergyEvaluation ? unitEnergyEvaluation.status_text || '' : ''}
              title={t('Per Unit Product Energy Consumption') + ' (TCE/T)'}
              color={unitEnergyEvaluation && unitEnergyEvaluation.is_compliant === false ? 'warning' : 'success'}
              showFootnotes={!!unitEnergyEvaluation}
              footnote={t('Benchmark')}
              footvalue={Number(unitEnergyEvaluation && unitEnergyEvaluation.benchmark_value)}
              footunit="(TCE/T)"
              secondfootnote={t('Benchmark Gap')}
              secondfootvalue={null}
              secondfootunit={getGapDescription(unitEnergyEvaluation)}
              cardClassName="bg-white"
              bodyClassName="py-2"
              titleClassName="mb-1"
              valueClassName="fs-2"
            >
              <CountUp
                end={Number(summary.unit_comprehensive_energy_tce_per_t || 0)}
                duration={2}
                separator=","
                decimal="."
                decimals={4}
              />
            </CardSummary>
          </Col>
          <Col sm={6} lg={6} xl className="d-flex px-1" style={{ flex: '1 1 20%' }}>
            <CardSummary
              rate={unitCarbonEvaluation ? unitCarbonEvaluation.status_text || '' : ''}
              title={t('Per Unit Product Carbon Dioxide Emissions') + ' (TCO2E/T)'}
              color={unitCarbonEvaluation && unitCarbonEvaluation.is_compliant === false ? 'warning' : 'co2'}
              showFootnotes={!!unitCarbonEvaluation}
              footnote={t('Benchmark')}
              footvalue={Number(unitCarbonEvaluation && unitCarbonEvaluation.benchmark_value)}
              footunit="(TCO2E/T)"
              secondfootnote={t('Benchmark Gap')}
              secondfootvalue={null}
              secondfootunit={getGapDescription(unitCarbonEvaluation)}
              cardClassName="bg-white"
              bodyClassName="py-2"
              titleClassName="mb-1"
              valueClassName="fs-2"
            >
              <CountUp
                end={Number(summary.unit_carbon_tco2_per_t || 0)}
                duration={2}
                separator=","
                decimal="."
                decimals={4}
              />
            </CardSummary>
          </Col>
        </Row>

        <Card className="mb-3">
          <CardBody>
            <h5>{t('Energy Evaluation')}</h5>
            <Table responsive hover size="sm">
              <thead>
                <tr>
                  <th>{t('Metric')}</th>
                  <th>{t('Actual Value')}</th>
                  <th>{t('Benchmark')}</th>
                  <th>{t('Benchmark Gap')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Energy Evaluation')}</th>
                  <th>{t('Advice')}</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map(evaluation => (
                  <tr key={evaluation.metric_code}>
                    <td>{t(evaluation.metric_name || evaluation.metric_code)}</td>
                    <td>{formatNumber(evaluation.actual_value)}</td>
                    <td>{formatNumber(evaluation.benchmark_value)}</td>
                    <td style={{ minWidth: '12rem' }}>
                      <div className="d-flex align-items-center">
                        <div className="progress flex-grow-1 mr-2" style={{ height: '0.5rem' }}>
                          <div
                            className={`progress-bar bg-${getComparisonBarColor(evaluation)}`}
                            role="progressbar"
                            style={{ width: `${getComparisonBarWidth(evaluation)}%` }}
                            aria-valuemin="0"
                            aria-valuemax="100"
                          />
                        </div>
                        <small className="text-600">{getGapDescription(evaluation)}</small>
                      </div>
                    </td>
                    <td>
                      <Badge color={getBadgeColor(evaluation)}>{evaluation.status_text || t('No Rule Matched')}</Badge>
                    </td>
                    <td className="text-700">{evaluation.evaluation_text}</td>
                    <td style={{ minWidth: '16rem' }}>
                      {getAdviceItems(evaluation).length > 0 ? (
                        <Fragment>
                          <Button
                            color="link"
                            size="sm"
                            className="p-0 font-weight-semi-bold"
                            onClick={() => toggleAdvice(evaluation.metric_code)}
                          >
                            {expandedAdvice[evaluation.metric_code]
                              ? t('Hide Advice')
                              : `${t('View Advice')} (${getAdviceItems(evaluation).length})`}
                          </Button>
                          {expandedAdvice[evaluation.metric_code] ? (
                            <ol className="pl-3 mb-0 mt-2 text-700">
                              {getAdviceItems(evaluation).map((item, index) => (
                                <li key={`${evaluation.metric_code}-${index}`} className="mb-1">
                                  {item}
                                </li>
                              ))}
                            </ol>
                          ) : null}
                        </Fragment>
                      ) : (
                        <span className="text-500">{t('No Advice Available')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>

        <Card className="mb-3">
          <CardBody>
            <div className="d-flex flex-wrap align-items-center justify-content-between mb-3">
              <div>
                <h5 className="mb-1">{t('Trend')}</h5>
                <div className="text-600 fs--1">
                  {t('Trend Overview')}: {displayedTrends.length} {t('Records')}
                </div>
              </div>
              <Button
                color="link"
                size="sm"
                className="p-0 font-weight-semi-bold"
                onClick={() => setTrendDetailsVisible(currentValue => !currentValue)}
              >
                {trendDetailsVisible ? t('Hide Trend Details') : t('View Trend Details')}
              </Button>
            </div>

            {displayedTrends.length > 0 ? (
              <Fragment>
                <div className="border rounded-soft p-3 mb-3 bg-white">
                  <div className="font-weight-semi-bold text-dark mb-2">{t('Trend Overview')}</div>
                  <ReactEchartsCore
                    echarts={echarts}
                    notMerge={true}
                    option={getTrendChartOption()}
                    style={{ width: '100%', height: 360 }}
                    lazyUpdate={true}
                  />
                </div>

                {trendDetailsVisible ? (
                  <Table responsive hover size="sm" className="mb-0">
                    <thead>
                      <tr>
                        <th>{t('Datetime')}</th>
                        <th>{t('Production')}</th>
                        <th>{t('Energy Intensity')}</th>
                        <th>{t('Carbon Intensity')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedTrends.map(trend => (
                        <tr key={trend.datetime}>
                          <td>{trend.datetime}</td>
                          <td>{formatNumber(trend.production, 2)}</td>
                          <td>{formatNumber(trend.unit_comprehensive_energy_tce_per_t, 2)}</td>
                          <td>{formatNumber(trend.unit_carbon_tco2_per_t, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : null}
              </Fragment>
            ) : (
              <div className="text-500">{t('No Data')}</div>
            )}
          </CardBody>
        </Card>
      </div>
    </Fragment>
  );
};

export default withTranslation()(withRedirect(SpaceEvaluation));
