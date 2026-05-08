import React, { Fragment, useEffect, useState } from 'react';
import CountUp from 'react-countup';
import { Col, Row, Spinner } from 'reactstrap';
import CardSummary from '../common/CardSummary';
import LineChart from '../common/LineChart';
import { toast } from 'react-toastify';
import SharePie from '../common/SharePie';
import loadable from '@loadable/component';
import { getCookieValue, createCookie, checkEmpty,handleAPIError } from '../../../helpers/utils';
import withRedirect from '../../../hoc/withRedirect';
import { withTranslation } from 'react-i18next';
import moment from 'moment';
import { APIBaseURL, settings } from '../../../config';
import { v4 as uuid } from 'uuid';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Chart as ChartJS } from 'chart.js';
import BarChart from '../common/BarChart';
import ChartSpacesStackBar from '../common/ChartSpacesStackBar';
import RealtimeSensor from '../common/RealtimeSensor';
import CustomizeMapBox from '../common/CustomizeMapBox';
import { HIDE_CHILD_SPACE_PANELS } from '../common/panelVisibility';

ChartJS.register(annotationPlugin);

const formatPercentage = value =>
  typeof value === 'number' && Number.isFinite(value) ? parseFloat(value * 100).toFixed(2) + '%' : '';

const hasDisplayValue = value => value !== null && value !== undefined;

const formatDisplayNumber = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const PIE_COLOR_PALETTE = [
  '#3a7bd5',
  '#00a896',
  '#ff9f1c',
  '#d7263d',
  '#6c5ce7',
  '#2a9d8f',
  '#e76f51',
  '#577590',
  '#8ab17d',
  '#f4a261'
];

const getStablePieColor = key => {
  const normalizedKey = String(key || 'default');
  let hash = 0;

  for (let index = 0; index < normalizedKey.length; index++) {
    hash = (hash << 5) - hash + normalizedKey.charCodeAt(index);
    hash |= 0;
  }

  return PIE_COLOR_PALETTE[Math.abs(hash) % PIE_COLOR_PALETTE.length];
};

const buildPieDataItem = (id, name, value, colorKey) => ({
  id,
  name,
  value,
  color: getStablePieColor(colorKey || `${id}-${name}`)
});

const buildProductionSummary = productData => {
  if (!productData || !Array.isArray(productData.subtotals) || productData.subtotals.length === 0) {
    return {
      value: null,
      unit: '',
      rate: '',
      items: []
    };
  }

  const productItems = productData.subtotals
    .map((subtotal, index) => ({
      productId: productData.product_ids?.[index],
      name: productData.names?.[index],
      unit: productData.units?.[index],
      subtotal,
      incrementRate: productData.increment_rates?.[index]
    }))
    .filter(item => typeof item.subtotal === 'number' && Number.isFinite(item.subtotal));

  if (productItems.length === 0) {
    return {
      value: null,
      unit: '',
      rate: '',
      items: []
    };
  }

  const firstUnit = productItems[0].unit;
  const canAggregate = firstUnit && productItems.every(item => item.unit === firstUnit);
  const productionValue =
    canAggregate && productItems.length > 1
      ? productItems.reduce((total, currentItem) => total + currentItem.subtotal, 0)
      : productItems.length === 1
        ? productItems[0].subtotal
        : null;
  const productionRate =
    productItems.length === 1 ? formatPercentage(productItems[0].incrementRate) : '';

  return {
    value: productionValue,
    unit: canAggregate ? firstUnit : '',
    rate: productionRate,
    items: productItems
  };
};

const buildPerUnitMetricItems = (productItems, totalValue, numeratorUnit) => {
  if (typeof totalValue !== 'number' || !Number.isFinite(totalValue)) {
    return [];
  }

  return productItems
    .filter(item => typeof item.subtotal === 'number' && Number.isFinite(item.subtotal) && item.subtotal > 0)
    .map(item => ({
      productId: item.productId,
      name: item.name,
      value: totalValue / item.subtotal,
      unit: item.unit ? `${numeratorUnit}/${item.unit}` : `${numeratorUnit}/单位`
    }));
};

const renderMetricAdditionalContent = metricItems =>
  metricItems.length > 1 ? (
    <div className="fs--1 text-600 mb-2">
      {metricItems.map((item, index) => (
        <div key={item.productId || item.name || `${item.unit}-${index}`}>
          {`${index + 1}. ${item.name}: ${formatDisplayNumber(item.value)} (${item.unit})`}
        </div>
      ))}
    </div>
  ) : null;

const Dashboard = ({ setRedirect, setRedirectUrl, t }) => {
  let current_moment = moment();
  const [isFetchDashboard, setIsFetchDashboard] = useState(true);
  const [basePeriodBeginsDatetime, setBasePeriodBeginsDatetime] = useState(
    current_moment
      .clone()
      .subtract(1, 'years')
      .startOf('month')
  );
  const [basePeriodEndsDatetime, setBasePeriodEndsDatetime] = useState(
    current_moment
      .clone()
      .subtract(1, 'years')
      .endOf('day')
  );
  const [reportingPeriodBeginsDatetime, setReportingPeriodBeginsDatetime] = useState(
    current_moment
      .clone()
      .subtract(1, 'years')
      .startOf('month')
  );
  const [reportingPeriodEndsDatetime, setReportingPeriodEndsDatetime] = useState(current_moment.clone().endOf('day'));

  const [spinnerHidden, setSpinnerHidden] = useState(false);

  //Results
  const [costShareData, setCostShareData] = useState([]);
  const [timeOfUseShareData, setTimeOfUseShareData] = useState([]);
  const [TCEShareData, setTCEShareData] = useState([]);
  const [TCO2EShareData, setTCO2EShareData] = useState([]);

  const [thisYearBarList, setThisYearBarList] = useState([]);
  const [lastYearBarList, setLastYearBarList] = useState([]);
  const [thisMonthInputCardSummaryList, setThisMonthInputCardSummaryList] = useState([]);
  const [thisMonthCostCardSummaryList, setThisMonthCostCardSummaryList] = useState([]);
  const [thisMonthOutputCardSummaryList, setThisMonthOutputCardSummaryList] = useState([]);
  const [barLabels, setBarLabels] = useState([]);
  const [totalInTCE, setTotalInTCE] = useState({});
  const [totalInTCO2E, setTotalInTCO2E] = useState({});
  const [productionSummary, setProductionSummary] = useState({});

  const [spaceInputLineChartLabels, setSpaceInputLineChartLabels] = useState([]);
  const [spaceInputLineChartData, setSpaceInputLineChartData] = useState({});
  const [spaceInputLineChartOptions, setSpaceInputLineChartOptions] = useState([]);
  const [spaceCostLineChartOptions, setSpaceCostLineChartOptions] = useState([]);
  const [spaceCostLineChartLabels, setSpaceCostLineChartLabels] = useState([]);
  const [spaceCostLineChartData, setSpaceCostLineChartData] = useState({});

  const [detailedDataTableData, setDetailedDataTableData] = useState([]);
  const [detailedDataTableColumns, setDetailedDataTableColumns] = useState([
    { dataField: 'startdatetime', text: t('Datetime'), sort: true }
  ]);

  const [childSpacesTableData, setChildSpacesTableData] = useState([]);
  const [childSpacesTableColumns, setChildSpacesTableColumns] = useState([
    { dataField: 'name', text: t('Child Spaces'), sort: true }
  ]);

  const [childSpacesInputData, setChildSpacesInputData] = useState([]);
  const [childSpacesCostData, setChildSpacesCostData] = useState([]);
  const [monthLabels, setMonthLabels] = useState([]);
  const [geojson, setGeojson] = useState({});
  const [rootLatitude, setRootLatitude] = useState('');
  const [rootLongitude, setRootLongitude] = useState('');

  const [sensor, setSensor] = useState({});
  const [pointList, setPointList] = useState({});

  useEffect(() => {
    let is_logged_in = getCookieValue('is_logged_in');
    let user_name = getCookieValue('user_name');
    let user_display_name = getCookieValue('user_display_name');
    let user_uuid = getCookieValue('user_uuid');
    let token = getCookieValue('token');
    if (checkEmpty(is_logged_in) || checkEmpty(token) || checkEmpty(user_uuid) || !is_logged_in) {
      setRedirectUrl(`/authentication/basic/login`);
      setRedirect(true);
    } else {
      //update expires time of cookies
      createCookie('is_logged_in', true, settings.cookieExpireTime);
      createCookie('user_name', user_name, settings.cookieExpireTime);
      createCookie('user_display_name', user_display_name, settings.cookieExpireTime);
      createCookie('user_uuid', user_uuid, settings.cookieExpireTime);
      createCookie('token', token, settings.cookieExpireTime);

      let isResponseOK = false;
      if (isFetchDashboard) {
        setIsFetchDashboard(false);
        toast(
          <Fragment>
            {t('Welcome to MyEMS')}
            <br />
            {t('An Industry Leading Open Source Energy Management System')}
          </Fragment>
        );

        fetch(
          APIBaseURL +
            '/reports/dashboard?' +
            'useruuid=' +
            user_uuid +
            '&baseperiodstartdatetime=' +
            (basePeriodBeginsDatetime != null ? basePeriodBeginsDatetime.format('YYYY-MM-DDTHH:mm:ss') : '') +
            '&baseperiodenddatetime=' +
            (basePeriodEndsDatetime != null ? basePeriodEndsDatetime.format('YYYY-MM-DDTHH:mm:ss') : '') +
            '&reportingperiodstartdatetime=' +
            reportingPeriodBeginsDatetime.format('YYYY-MM-DDTHH:mm:ss') +
            '&reportingperiodenddatetime=' +
            reportingPeriodEndsDatetime.format('YYYY-MM-DDTHH:mm:ss'),
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
              // hide spinner
              setSpinnerHidden(true);
              let labels = [];
              let thisYearBarList = [];
              let lastYearBarList = [];
              json['reporting_period_input']['names'].forEach((currentValue, index) => {
                let cardSummaryItem = {};
                cardSummaryItem['name'] = json['reporting_period_input']['names'][index];
                cardSummaryItem['unit'] = json['reporting_period_input']['units'][index];
                cardSummaryItem['subtotal'] = json['reporting_period_input']['subtotals'][index];
                cardSummaryItem['increment_rate'] = formatPercentage(json['reporting_period_input']['increment_rates'][index]);
                cardSummaryItem['subtotal_per_unit_area'] =
                  json['space']['area'] > 0
                    ? parseFloat(cardSummaryItem['subtotal'] / json['space']['area']).toFixed(3)
                    : 0.0;
                cardSummaryItem['subtotal_per_capita'] =
                  json['space']['number_of_occupants'] > 0
                    ? parseFloat(cardSummaryItem['subtotal'] / json['space']['number_of_occupants']).toFixed(3)
                    : 0.0;
                labels.push(
                  t('CATEGORY Consumption UNIT', { CATEGORY: null, UNIT: null }) +
                    cardSummaryItem['name'] +
                    cardSummaryItem['unit']
                );
                thisYearBarList.push(cardSummaryItem);
              });

              json['reporting_period_cost']['names'].forEach((currentValue, index) => {
                let cardSummaryItem = {};
                cardSummaryItem['name'] = json['reporting_period_cost']['names'][index];
                cardSummaryItem['unit'] = json['reporting_period_cost']['units'][index];
                cardSummaryItem['subtotal'] = json['reporting_period_cost']['subtotals'][index];
                cardSummaryItem['increment_rate'] = formatPercentage(json['reporting_period_cost']['increment_rates'][index]);
                cardSummaryItem['subtotal_per_unit_area'] =
                  json['space']['area'] > 0
                    ? parseFloat(cardSummaryItem['subtotal'] / json['space']['area']).toFixed(3)
                    : 0.0;
                cardSummaryItem['subtotal_per_capita'] =
                  json['space']['number_of_occupants'] > 0
                    ? parseFloat(cardSummaryItem['subtotal'] / json['space']['number_of_occupants']).toFixed(3)
                    : 0.0;
                labels.push(
                  t('CATEGORY Costs UNIT', { CATEGORY: null, UNIT: null }) +
                    cardSummaryItem['name'] +
                    cardSummaryItem['unit']
                );
                thisYearBarList.push(cardSummaryItem);
              });
              setBarLabels(labels);
              setThisYearBarList(thisYearBarList);

              json['base_period_input']['names'].forEach((currentValue, index) => {
                let cardSummaryItem = {};
                cardSummaryItem['name'] = json['base_period_input']['names'][index];
                cardSummaryItem['unit'] = json['base_period_input']['units'][index];
                cardSummaryItem['subtotal'] = json['base_period_input']['subtotals'][index];
                cardSummaryItem['increment_rate'] = null;
                cardSummaryItem['subtotal_per_unit_area'] =
                  json['space']['area'] > 0
                    ? parseFloat(cardSummaryItem['subtotal'] / json['space']['area']).toFixed(3)
                    : 0.0;
                cardSummaryItem['subtotal_per_capita'] =
                  json['space']['number_of_occupants'] > 0
                    ? parseFloat(cardSummaryItem['subtotal'] / json['space']['number_of_occupants']).toFixed(3)
                    : 0.0;
                lastYearBarList.push(cardSummaryItem);
              });

              json['base_period_cost']['names'].forEach((currentValue, index) => {
                let cardSummaryItem = {};
                cardSummaryItem['name'] = json['base_period_cost']['names'][index];
                cardSummaryItem['unit'] = json['base_period_cost']['units'][index];
                cardSummaryItem['subtotal'] = json['base_period_cost']['subtotals'][index];
                cardSummaryItem['increment_rate'] = null;
                cardSummaryItem['subtotal_per_unit_area'] =
                  json['space']['area'] > 0
                    ? parseFloat(cardSummaryItem['subtotal'] / json['space']['area']).toFixed(3)
                    : 0.0;
                cardSummaryItem['subtotal_per_capita'] =
                  json['space']['number_of_occupants'] > 0
                    ? parseFloat(cardSummaryItem['subtotal'] / json['space']['number_of_occupants']).toFixed(3)
                    : 0.0;
                lastYearBarList.push(cardSummaryItem);
              });
              setLastYearBarList(lastYearBarList);

              let timeOfUseArray = [];
              json['reporting_period_input']['energy_category_ids'].forEach((currentValue, index) => {
                if (currentValue === 1) {
                  // energy_category_id 1 electricity
                  timeOfUseArray.push(buildPieDataItem(1, t('Top-Peak'), json['reporting_period_input']['toppeaks'][index], 'tou-top-peak'));
                  timeOfUseArray.push(buildPieDataItem(2, t('On-Peak'), json['reporting_period_input']['onpeaks'][index], 'tou-on-peak'));
                  timeOfUseArray.push(buildPieDataItem(3, t('Mid-Peak'), json['reporting_period_input']['midpeaks'][index], 'tou-mid-peak'));
                  timeOfUseArray.push(buildPieDataItem(4, t('Off-Peak'), json['reporting_period_input']['offpeaks'][index], 'tou-off-peak'));
                  timeOfUseArray.push(buildPieDataItem(5, t('Deep'), json['reporting_period_input']['deeps'][index], 'tou-deep'));
                }
              });
              setTimeOfUseShareData(timeOfUseArray);
              let totalInTCE = {};
              totalInTCE['value'] = json['reporting_period_input']['this_month_total_in_kgce'] / 1000; // convert from kg to t
              totalInTCE['increment_rate'] = formatPercentage(json['reporting_period_input']['this_month_increment_rate_in_kgce']);
              totalInTCE['value_per_unit_area'] =
                json['space']['area'] > 0 ? parseFloat(1000.0 * totalInTCE['value'] / json['space']['area']).toFixed(3) : 0.0;
              totalInTCE['value_per_capita'] =
                json['space']['number_of_occupants'] > 0
                  ? parseFloat(1000.0 *totalInTCE['value'] / json['space']['number_of_occupants']).toFixed(3)
                  : 0.0;
              setTotalInTCE(totalInTCE);

              let costDataArray = [];
              json['reporting_period_cost']['names'].forEach((currentValue, index) => {
                costDataArray.push(
                  buildPieDataItem(
                    index,
                    currentValue,
                    json['reporting_period_cost']['subtotals'][index],
                    `cost-${json['reporting_period_cost']['energy_category_ids']?.[index] ?? currentValue}`
                  )
                );
              });

              setCostShareData(costDataArray);
              let totalInTCO2E = {};
              totalInTCO2E['value'] = json['reporting_period_input']['this_month_total_in_kgco2e'] / 1000; // convert from kg to t
              totalInTCO2E['increment_rate'] = formatPercentage(json['reporting_period_input']['this_month_increment_rate_in_kgco2e']);
              totalInTCO2E['value_per_unit_area'] =
                json['space']['area'] > 0 ? parseFloat(1000.0 * totalInTCO2E['value'] / json['space']['area']).toFixed(3) : 0.0;
              totalInTCO2E['value_per_capita'] =
                json['space']['number_of_occupants'] > 0
                  ? parseFloat(1000.0 * totalInTCO2E['value'] / json['space']['number_of_occupants']).toFixed(3)
                  : 0.0;
              setTotalInTCO2E(totalInTCO2E);
              setProductionSummary(buildProductionSummary(json['reporting_period_product']));

              let TCEDataArray = [];
              json['reporting_period_input']['names'].forEach((currentValue, index) => {
                TCEDataArray.push(
                  buildPieDataItem(
                    index,
                    currentValue,
                    json['reporting_period_input']['subtotals_in_kgce'][index] / 1000,
                    `energy-category-${json['reporting_period_input']['energy_category_ids']?.[index] ?? currentValue}`
                  )
                );
              });
              setTCEShareData(TCEDataArray);

              let TCO2EDataArray = [];
              json['reporting_period_input']['names'].forEach((currentValue, index) => {
                TCO2EDataArray.push(
                  buildPieDataItem(
                    index,
                    currentValue,
                    json['reporting_period_input']['subtotals_in_kgco2e'][index] / 1000,
                    `energy-category-${json['reporting_period_input']['energy_category_ids']?.[index] ?? currentValue}`
                  )
                );
              });
              setTCO2EShareData(TCO2EDataArray);

              let timestamps = {};
              json['reporting_period_input']['timestamps'].forEach((currentValue, index) => {
                timestamps['a' + index] = currentValue;
              });
              setSpaceInputLineChartLabels(timestamps);

              let values = {};
              json['reporting_period_input']['values'].forEach((currentValue, index) => {
                values['a' + index] = currentValue;
              });
              setSpaceInputLineChartData(values);

              let input_names = [];
              let thisMonthInputArr = [];
              json['reporting_period_input']['names'].forEach((currentValue, index) => {
                let unit = json['reporting_period_input']['units'][index];
                let thisMonthItem = {};
                input_names.push({ value: 'a' + index, label: currentValue + ' (' + unit + ')' });
                thisMonthItem['name'] = json['reporting_period_input']['names'][index];
                thisMonthItem['unit'] = json['reporting_period_input']['units'][index];
                thisMonthItem['subtotal'] = json['reporting_period_input']['subtotals'][index];
                thisMonthItem['increment_rate'] = formatPercentage(json['reporting_period_input']['increment_rates'][index]);
                thisMonthItem['subtotal_per_unit_area'] =
                  json['space']['area'] > 0
                    ? parseFloat(thisMonthItem['subtotal'] / json['space']['area']).toFixed(3)
                    : 0.0;
                thisMonthItem['subtotal_per_capita'] =
                  json['space']['number_of_occupants'] > 0
                    ? parseFloat(thisMonthItem['subtotal'] / json['space']['number_of_occupants']).toFixed(3)
                    : 0.0;
                thisMonthInputArr.push(thisMonthItem);
              });
              setSpaceInputLineChartOptions(input_names);
              setThisMonthInputCardSummaryList(thisMonthInputArr);

              let thisMonthOutputArr = [];
              let output_names = [];
              json['reporting_period_output']['names'].forEach((currentValue, index) => {
                let unit = json['reporting_period_output']['units'][index];
                let thisMonthItem = {};
                output_names.push({ value: 'a' + index, label: currentValue + ' (' + unit + ')' });
                thisMonthItem['name'] = json['reporting_period_output']['names'][index];
                thisMonthItem['unit'] = json['reporting_period_output']['units'][index];
                thisMonthItem['subtotal'] = json['reporting_period_output']['subtotals'][index];
                thisMonthItem['increment_rate'] = formatPercentage(json['reporting_period_output']['increment_rates'][index]);
                thisMonthItem['subtotal_per_unit_area'] =
                  json['space']['area'] > 0
                    ? parseFloat(thisMonthItem['subtotal'] / json['space']['area']).toFixed(3)
                    : 0.0;
                thisMonthItem['subtotal_per_capita'] =
                  json['space']['number_of_occupants'] > 0
                    ? parseFloat(thisMonthItem['subtotal'] / json['space']['number_of_occupants']).toFixed(3)
                    : 0.0;
                thisMonthOutputArr.push(thisMonthItem);
              });
              setThisMonthOutputCardSummaryList(thisMonthOutputArr);

              timestamps = {};
              json['reporting_period_cost']['timestamps'].forEach((currentValue, index) => {
                timestamps['a' + index] = currentValue;
              });
              setSpaceCostLineChartLabels(timestamps);

              values = {};
              json['reporting_period_cost']['values'].forEach((currentValue, index) => {
                values['a' + index] = currentValue;
              });
              setSpaceCostLineChartData(values);

              let cost_names = [];
              let thisMonthCostArr = [];
              json['reporting_period_cost']['names'].forEach((currentValue, index) => {
                let thisMonthItem = {};
                let unit = json['reporting_period_cost']['units'][index];
                cost_names.push({ value: 'a' + index, label: currentValue + ' (' + unit + ')' });
                thisMonthItem['name'] = json['reporting_period_cost']['names'][index];
                thisMonthItem['unit'] = json['reporting_period_cost']['units'][index];
                thisMonthItem['subtotal'] = json['reporting_period_cost']['subtotals'][index];
                thisMonthItem['increment_rate'] = formatPercentage(json['reporting_period_cost']['increment_rates'][index]);
                thisMonthItem['subtotal_per_unit_area'] =
                  json['space']['area'] > 0
                    ? parseFloat(thisMonthItem['subtotal'] / json['space']['area']).toFixed(3)
                    : 0.0;
                thisMonthItem['subtotal_per_capita'] =
                  json['space']['number_of_occupants'] > 0
                    ? parseFloat(thisMonthItem['subtotal'] / json['space']['number_of_occupants']).toFixed(3)
                    : 0.0;

                thisMonthCostArr.push(thisMonthItem);
              });
              setSpaceCostLineChartOptions(cost_names);
              setThisMonthCostCardSummaryList(thisMonthCostArr);

              let detailed_value_list = [];
              if (json['reporting_period_input']['timestamps'].length > 0) {
                json['reporting_period_input']['timestamps'][0].forEach((currentTimestamp, timestampIndex) => {
                  let detailed_value = {};
                  detailed_value['id'] = timestampIndex;
                  detailed_value['startdatetime'] = currentTimestamp;
                  json['reporting_period_input']['values'].forEach((currentValue, energyCategoryIndex) => {
                    detailed_value['a' + energyCategoryIndex] = json['reporting_period_input']['values'][
                      energyCategoryIndex
                    ][timestampIndex].toFixed(2);
                  });
                  detailed_value_list.push(detailed_value);
                });
              }

              let detailed_value = {};
              detailed_value['id'] = detailed_value_list.length;
              detailed_value['startdatetime'] = t('Subtotal');
              json['reporting_period_input']['subtotals'].forEach((currentValue, index) => {
                detailed_value['a' + index] = currentValue.toFixed(2);
              });
              detailed_value_list.push(detailed_value);
              setTimeout(() => {
                setDetailedDataTableData(detailed_value_list);
              }, 0);

              let detailed_column_list = [];
              detailed_column_list.push({
                dataField: 'startdatetime',
                text: t('Datetime'),
                sort: true
              });
              json['reporting_period_input']['names'].forEach((currentValue, index) => {
                let unit = json['reporting_period_cost']['units'][index];
                detailed_column_list.push({
                  dataField: 'a' + index,
                  text: currentValue + ' (' + unit + ')',
                  sort: true
                });
              });
              setDetailedDataTableColumns(detailed_column_list);

              let child_space_value_list = [];
              if (json['child_space_input']['child_space_names_array'].length > 0) {
                json['child_space_input']['child_space_names_array'][0].forEach((currentSpaceName, spaceIndex) => {
                  let child_space_value = {};
                  child_space_value['id'] = spaceIndex;
                  child_space_value['name'] = currentSpaceName;
                  json['child_space_input']['energy_category_names'].forEach((currentValue, energyCategoryIndex) => {
                    child_space_value['a' + energyCategoryIndex] =
                      json['child_space_input']['subtotals_array'][energyCategoryIndex][spaceIndex];
                    child_space_value['b' + energyCategoryIndex] =
                      json['child_space_cost']['subtotals_array'][energyCategoryIndex][spaceIndex];
                  });
                  child_space_value_list.push(child_space_value);
                });
              }

              setChildSpacesTableData(child_space_value_list);

              let child_space_column_list = [];
              child_space_column_list.push({
                dataField: 'name',
                text: t('Child Spaces'),
                sort: true
              });
              json['child_space_input']['energy_category_names'].forEach((currentValue, index) => {
                let unit = json['child_space_input']['units'][index];
                child_space_column_list.push({
                  dataField: 'a' + index,
                  text: t('CATEGORY Consumption UNIT', { CATEGORY: currentValue, UNIT: '(' + unit + ')' }),
                  sort: true,
                  formatter: function(decimalValue) {
                    if (typeof decimalValue === 'number') {
                      return decimalValue.toFixed(2);
                    } else {
                      return null;
                    }
                  }
                });
              });
              json['child_space_cost']['energy_category_names'].forEach((currentValue, index) => {
                let unit = json['child_space_cost']['units'][index];
                child_space_column_list.push({
                  dataField: 'b' + index,
                  text: t('CATEGORY Costs UNIT', { CATEGORY: currentValue, UNIT: '(' + unit + ')' }),
                  sort: true,
                  formatter: function(decimalValue) {
                    if (typeof decimalValue === 'number') {
                      return decimalValue.toFixed(2);
                    } else {
                      return null;
                    }
                  }
                });
              });

              setChildSpacesTableColumns(child_space_column_list);
              setChildSpacesInputData(json['child_space_input']);
              setChildSpacesCostData(json['child_space_cost']);
              setMonthLabels(json['reporting_period_cost']['timestamps'][0]);
              setSensor(json['sensor']);
              setPointList(json['point']);
            }
          });
      }
    }
  });

  useEffect(() => {
    let timer = setInterval(() => {
      let is_logged_in = getCookieValue('is_logged_in');
      if (is_logged_in === null || !is_logged_in) {
        setRedirectUrl(`/authentication/basic/login`);
        setRedirect(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [setRedirect, setRedirectUrl]);

  useEffect(() => {
    let is_logged_in = getCookieValue('is_logged_in');
    let user_name = getCookieValue('user_name');
    let user_display_name = getCookieValue('user_display_name');
    let user_uuid = getCookieValue('user_uuid');
    let token = getCookieValue('token');
    if (checkEmpty(is_logged_in) || checkEmpty(token) || checkEmpty(user_uuid) || !is_logged_in) {
      setRedirectUrl(`/authentication/basic/login`);
      setRedirect(true);
    } else {
      //update expires time of cookies
      createCookie('is_logged_in', true, settings.cookieExpireTime);
      createCookie('user_name', user_name, settings.cookieExpireTime);
      createCookie('user_display_name', user_display_name, settings.cookieExpireTime);
      createCookie('user_uuid', user_uuid, settings.cookieExpireTime);
      createCookie('token', token, settings.cookieExpireTime);

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
          }
          return response.json();
        })
        .then(json => {
          if (isResponseOK) {
            // rename keys
            json = JSON.parse(
              JSON.stringify([json])
                .split('"id":')
                .join('"value":')
                .split('"name":')
                .join('"label":')
            );
            // get chiildren of root Space
            let isResponseOK = false;
            fetch(APIBaseURL + '/spaces/' + [json[0]].map(o => o.value) + '/children', {
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
                  json = JSON.parse(
                    JSON.stringify([json])
                      .split('"id":')
                      .join('"value":')
                      .split('"name":')
                      .join('"label":')
                  );
                  setRootLongitude(json[0]['current']['longitude']);
                  setRootLatitude(json[0]['current']['latitude']);
                  let geojson = {};
                  geojson['type'] = 'FeatureCollection';
                  let geojsonData = [];
                  for (const childSpace of json[0]['children']) {
                    if (childSpace['latitude'] && childSpace['longitude']) {
                      geojsonData.push({
                        type: 'Feature',
                        geometry: {
                          type: 'Point',
                          coordinates: [childSpace['longitude'], childSpace['latitude']]
                        },
                        properties: {
                          title: childSpace['label'],
                          description: childSpace['description'],
                          uuid: childSpace['uuid'],
                          url: '/space/energycategory'
                        }
                      });
                    }
                  }
                  geojson['features'] = geojsonData;
                  setGeojson(geojson);
                } else {
                  handleAPIError(json, setRedirect, setRedirectUrl, t, toast);
                }
              })
              .catch(err => {
                console.log(err);
              });
            // end of get children of root Space
          } else {
            handleAPIError(json, setRedirect, setRedirectUrl, t, toast);
          }
        })
        .catch(err => {
          console.log(err);
        });
    }
  }, [setRedirect, setRedirectUrl, t]);

  const productionValue = productionSummary['value'];
  const productionUnit = productionSummary['unit'];
  const productionItems = productionSummary['items'] || [];
  const perUnitComprehensiveEnergyItems = buildPerUnitMetricItems(productionItems, totalInTCE['value'], 'TCE');
  const perUnitCarbonEmissionItems = buildPerUnitMetricItems(productionItems, totalInTCO2E['value'], 'TCO2E');
  const perUnitComprehensiveEnergy =
    perUnitComprehensiveEnergyItems.length === 1 ? perUnitComprehensiveEnergyItems[0].value : null;
  const perUnitCarbonEmissions =
    perUnitCarbonEmissionItems.length === 1 ? perUnitCarbonEmissionItems[0].value : null;
  const productionAdditionalContent =
    productionItems.length > 1 ? (
      <div className="fs--1 text-600 mb-2">
        {productionItems.map((item, index) => (
          <div key={item.productId || item.name}>
            {`${index + 1}. ${item.name}: ${formatDisplayNumber(item.subtotal)}${item.unit ? ` (${item.unit})` : ''}`}
          </div>
        ))}
      </div>
    ) : null;
  const perUnitComprehensiveEnergyAdditionalContent = renderMetricAdditionalContent(perUnitComprehensiveEnergyItems);
  const perUnitCarbonEmissionsAdditionalContent = renderMetricAdditionalContent(perUnitCarbonEmissionItems);

  return (
    <Fragment>
      <div className="card-deck">
        <Spinner color="primary" hidden={spinnerHidden} />
        {thisMonthInputCardSummaryList.map(cardSummaryItem => (
          <CardSummary
            key={uuid()}
            rate={cardSummaryItem['increment_rate']}
            title={t("This Month's Consumption CATEGORY VALUE UNIT", {
              CATEGORY: cardSummaryItem['name'],
              VALUE: null,
              UNIT: '(' + cardSummaryItem['unit'] + ')'
            })}
            color="success"
            footnote={t('Per Unit Area')}
            footvalue={cardSummaryItem['subtotal_per_unit_area']}
            footunit={'(' + cardSummaryItem['unit'] + '/m²)'}
            secondfootnote={t('Per Capita')}
            secondfootvalue={cardSummaryItem['subtotal_per_capita']}
            secondfootunit={'(' + cardSummaryItem['unit'] + ')'}
          >
            {hasDisplayValue(cardSummaryItem['subtotal']) && (
              <CountUp
                end={cardSummaryItem['subtotal']}
                duration={2}
                prefix=""
                separator=","
                decimal="."
                decimals={0}
              />
            )}
          </CardSummary>
        ))}
        {thisMonthCostCardSummaryList.map(cardSummaryItem => (
          <CardSummary
            key={uuid()}
            rate={cardSummaryItem['increment_rate']}
            title={t("This Month's Costs CATEGORY VALUE UNIT", {
              CATEGORY: cardSummaryItem['name'],
              VALUE: null,
              UNIT: '(' + cardSummaryItem['unit'] + ')'
            })}
            color="success"
            footnote={t('Per Unit Area')}
            footvalue={cardSummaryItem['subtotal_per_unit_area']}
            footunit={'(' + cardSummaryItem['unit'] + '/m²)'}
            secondfootnote={t('Per Capita')}
            secondfootvalue={cardSummaryItem['subtotal_per_capita']}
            secondfootunit={'(' + cardSummaryItem['unit'] + ')'}
          >
            {hasDisplayValue(cardSummaryItem['subtotal']) && (
              <CountUp
                end={cardSummaryItem['subtotal']}
                duration={2}
                prefix=""
                separator=","
                decimal="."
                decimals={0}
              />
            )}
          </CardSummary>
        ))}
        {thisMonthOutputCardSummaryList.map(cardSummaryItem => (
          <CardSummary
            key={uuid()}
            rate={cardSummaryItem['increment_rate']}
            title={t("This Month's Generation CATEGORY VALUE UNIT", {
              CATEGORY: cardSummaryItem['name'],
              VALUE: null,
              UNIT: '(' + cardSummaryItem['unit'] + ')'
            })}
            color="success"
            footnote={t('Per Unit Area')}
            footvalue={cardSummaryItem['subtotal_per_unit_area']}
            footunit={'(' + cardSummaryItem['unit'] + '/m²)'}
            secondfootnote={t('Per Capita')}
            secondfootvalue={cardSummaryItem['subtotal_per_capita']}
            secondfootunit={'(' + cardSummaryItem['unit'] + ')'}
          >
            {hasDisplayValue(cardSummaryItem['subtotal']) && (
              <CountUp
                end={cardSummaryItem['subtotal']}
                duration={2}
                prefix=""
                separator=","
                decimal="."
                decimals={0}
              />
            )}
          </CardSummary>
        ))}
      </div>
      <div className="card-deck">
        {settings.showTCEData ? (
          <>
            <CardSummary
              rate={totalInTCE['increment_rate'] || ''}
              title={t("This Month's Consumption CATEGORY VALUE UNIT", {
                CATEGORY: t('Ton of Standard Coal'),
                UNIT: '(TCE)'
              })}
              color="warning"
              footnote={t('Per Unit Area')}
              footvalue={totalInTCE['value_per_unit_area']}
              footunit="(kgCE/m²)"
              secondfootnote={t('Per Capita')}
              secondfootvalue={totalInTCE['value_per_capita']}
              secondfootunit="(kgCE)"
            >
              {hasDisplayValue(totalInTCE['value']) && (
                <CountUp end={totalInTCE['value']} duration={2} prefix="" separator="," decimal="." decimals={2} />
              )}
            </CardSummary>
            <CardSummary
              title={t('Per Unit Comprehensive Energy') + (productionUnit ? ` (TCE/${productionUnit})` : ' (TCE/单位)')}
              color="info"
              additionalContent={perUnitComprehensiveEnergyAdditionalContent}
            >
              {perUnitComprehensiveEnergyItems.length === 1 && hasDisplayValue(perUnitComprehensiveEnergy) ? (
                <CountUp end={perUnitComprehensiveEnergy} duration={2} prefix="" separator="," decimal="." decimals={2} />
              ) : null}
            </CardSummary>
          </>
        ) : (
          <></>
        )}
        <CardSummary
          rate={totalInTCO2E['increment_rate'] || ''}
          title={t("This Month's Consumption CATEGORY VALUE UNIT", {
            CATEGORY: t('Ton of Carbon Dioxide Emissions'),
            UNIT: '(TCO2E)'
          })}
          color="warning"
          footnote={t('Per Unit Area')}
          footvalue={totalInTCO2E['value_per_unit_area']}
          footunit="(kgCO2E/m²)"
          secondfootnote={t('Per Capita')}
          secondfootvalue={totalInTCO2E['value_per_capita']}
          secondfootunit="(kgCO2E)"
        >
          {hasDisplayValue(totalInTCO2E['value']) && (
            <CountUp end={totalInTCO2E['value']} duration={2} prefix="" separator="," decimal="." decimals={2} />
          )}
        </CardSummary>
        <CardSummary
          title={
            t('Per Unit Product Carbon Dioxide Emissions') +
            (productionUnit ? ` (TCO2E/${productionUnit})` : ' (TCO2E/单位)')
          }
          color="info"
          additionalContent={perUnitCarbonEmissionsAdditionalContent}
        >
          {perUnitCarbonEmissionItems.length === 1 && hasDisplayValue(perUnitCarbonEmissions) ? (
            <CountUp end={perUnitCarbonEmissions} duration={2} prefix="" separator="," decimal="." decimals={2} />
          ) : null}
        </CardSummary>
        <CardSummary
          rate={
            totalInTCE['value'] &&
            totalInTCE['value'] !== 0 &&
            totalInTCO2E['value'] &&
            totalInTCO2E['increment_rate'] &&
            totalInTCE['increment_rate']
              ? (parseFloat(totalInTCO2E['increment_rate']) / parseFloat(totalInTCE['increment_rate'])).toFixed(2) + '%'
              : ''
          }
          title={t("This Month's Consumption CATEGORY VALUE UNIT", {
            CATEGORY: t('Carbon Emissions Per Unit Of Energy Consumption'),
            UNIT: '(TCO2E/TCE)'
          })}
          color="warning"
          footnote={t('Per Unit Area')}
          footvalue={
            totalInTCE['value_per_unit_area'] &&
            totalInTCE['value_per_unit_area'] !== 0 &&
            totalInTCO2E['value_per_unit_area']
              ? (totalInTCO2E['value_per_unit_area'] / totalInTCE['value_per_unit_area']).toFixed(3)
              : '--'
          }
          footunit={t('(kgCO2E/kgCE/m²)')}
          secondfootnote={t('Per Capita')}
          secondfootvalue={
            totalInTCE['value_per_capita'] && totalInTCE['value_per_capita'] !== 0 && totalInTCO2E['value_per_capita']
              ? (totalInTCO2E['value_per_capita'] / totalInTCE['value_per_capita']).toFixed(3)
              : '--'
          }
          secondfootunit={t('(kgCO2E/kgCE)')}
        >
          {totalInTCE['value'] && totalInTCE['value'] !== 0 && totalInTCO2E['value'] ? (
            <CountUp
              end={totalInTCO2E['value'] / totalInTCE['value']}
              duration={2}
              prefix=""
              separator=","
              decimal="."
              decimals={3}
            />
          ) : (
            '--'
          )}
        </CardSummary>
        <CardSummary
          rate={productionSummary['rate'] || ''}
          title={t('Production') + (productionUnit ? ` (${productionUnit})` : '')}
          color="info"
          additionalContent={productionAdditionalContent}
        >
          {productionItems.length === 1 && hasDisplayValue(productionValue) ? (
            <CountUp end={productionValue} duration={2} prefix="" separator="," decimal="." decimals={2} />
          ) : null}
        </CardSummary>
      </div>
      <div className="card-deck">
        <BarChart
          labels={barLabels}
          data={lastYearBarList}
          compareData={thisYearBarList}
          title={t('The Same Period Last Year')}
          compareTitle={t('This Month')}
          footnote={t('Per Unit Area')}
          footunit={'/m²'}
        />
        <LineChart
          reportingTitle={t("This Year's Consumption CATEGORY VALUE UNIT", { CATEGORY: null, VALUE: null, UNIT: null })}
          baseTitle=""
          labels={spaceInputLineChartLabels}
          data={spaceInputLineChartData}
          options={spaceInputLineChartOptions}
        />
        <LineChart
          reportingTitle={t("This Year's Costs CATEGORY VALUE UNIT", { CATEGORY: null, VALUE: null, UNIT: null })}
          baseTitle=""
          labels={spaceCostLineChartLabels}
          data={spaceCostLineChartData}
          options={spaceCostLineChartOptions}
        />
      </div>
      <div className="wrapper" />
      <div className="card-deck">
        {settings.showOnlineMap ? (
          <div className="mb-3 card" style={{ height: '400px' }}>
            <CustomizeMapBox
              Latitude={rootLatitude}
              Longitude={rootLongitude}
              Zoom={10}
              Geojson={geojson['features']}
            />
          </div>
        ) : (
          <></>
        )}
        {Object.keys(sensor).map(item => (
          <RealtimeSensor key={uuid()} sensor={sensor[item]} pointList={pointList} />
        ))}
      </div>
      <Row noGutters>
        {/* <Col className="mb-3 pr-lg-2 mb-3">
          <SharePie data={timeOfUseShareData} title={t('Electricity Consumption by Time-Of-Use')} />
        </Col> */}
        <Col className="mb-3 pr-lg-2 mb-3">
          <SharePie data={costShareData} title={t('Costs by Energy Category')} />
        </Col>

        {settings.showTCEData ? (
          <Col className="mb-3 pr-lg-2 mb-3">
            <SharePie data={TCEShareData} title={t('Ton of Standard Coal by Energy Category')} />
          </Col>
        ) : (
          <></>
        )}

        <Col className="mb-3 pr-lg-2 mb-3">
          <SharePie data={TCO2EShareData} title={t('Ton of Carbon Dioxide Emissions by Energy Category')} />
        </Col>
      </Row>
      {!HIDE_CHILD_SPACE_PANELS ? (
        <ChartSpacesStackBar
          title={t('Child Spaces Data')}
          labels={monthLabels}
          inputData={childSpacesInputData}
          costData={childSpacesCostData}
          childSpaces={spaceInputLineChartOptions}
        />
      ) : null}
    </Fragment>
  );
};

export default withTranslation()(withRedirect(Dashboard));
