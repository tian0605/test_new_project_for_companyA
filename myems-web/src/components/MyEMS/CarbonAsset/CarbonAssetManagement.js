import React, { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  Col,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
  Table
} from 'reactstrap';
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { toast } from 'react-toastify';
import { withTranslation } from 'react-i18next';
import { checkEmpty, createCookie, getCookieValue } from '../../../helpers/utils';
import { APIBaseURL, settings } from '../../../config';
import withRedirect from '../../../hoc/withRedirect';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const emptyAsset = {
  space_id: '',
  accounting_year: new Date().getFullYear().toString(),
  government_quota: '0',
  previous_year_quota: '0',
  purchased_quota: '0',
  sold_quota: '0',
  own_ccer: '0',
  purchased_ccer: '0',
  sold_ccer: '0',
  purchased_green_certificate: '0',
  sold_green_certificate: '0',
  retired_green_certificate: '0',
  data_status: 'active',
  remark: ''
};

const toNumber = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatValue = value => {
  const numericValue = toNumber(value);

  return Number.isInteger(numericValue)
    ? numericValue.toLocaleString()
    : numericValue.toLocaleString(undefined, { maximumFractionDigits: 6 });
};

const formatFixed2 = value =>
  toNumber(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatSignedValue = value => {
  const numericValue = toNumber(value);

  if (numericValue > 0) {
    return `+${formatValue(numericValue)}`;
  }

  return formatValue(numericValue);
};

const chartPanelStyle = {
  borderRadius: '10px',
  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04)'
};

const chartCardBodyStyle = {
  padding: '18px 20px 20px'
};

const sectionTitleStyle = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#262626',
  marginBottom: '14px'
};

const marketHeaderCellStyle = {
  padding: '10px 12px',
  fontSize: '12px',
  color: '#595959',
  fontWeight: 600,
  backgroundColor: '#fafafa',
  borderTop: 'none',
  borderBottom: '1px solid #f0f0f0',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle'
};

const marketCellStyle = {
  padding: '9px 12px',
  fontSize: '13px',
  color: '#262626',
  borderTop: 'none',
  borderBottom: '1px solid #f5f5f5',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle'
};

const annualListHeaderCellStyle = {
  padding: '8px 12px',
  fontSize: '12px',
  lineHeight: 1.15,
  color: '#595959',
  fontWeight: 500,
  verticalAlign: 'middle'
};

const annualListHeaderTitleWrapStyle = {
  minHeight: '34px',
  display: 'flex',
  alignItems: 'center'
};

const annualListHeaderMetricWrapStyle = {
  minHeight: '34px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center'
};

const annualListHeaderUnitStyle = {
  marginTop: '2px',
  fontSize: '10px',
  lineHeight: 1.1,
  fontWeight: 400,
  color: '#8c8c8c'
};

const annualListCellStyle = {
  padding: '10px 12px',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap'
};

const CarbonAssetManagement = ({ setRedirect, setRedirectUrl, t }) => {
  const [spaces, setSpaces] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedSpaceID, setSelectedSpaceID] = useState('');
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [overview, setOverview] = useState(null);
  const [marketHistory, setMarketHistory] = useState([]);
  const [marketTotal, setMarketTotal] = useState(0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [assetForm, setAssetForm] = useState(emptyAsset);
  const [monthlyModalOpen, setMonthlyModalOpen] = useState(false);
  const [monthlyQuotas, setMonthlyQuotas] = useState([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const headers = useMemo(
    () => ({
      'Content-type': 'application/json',
      'User-UUID': getCookieValue('user_uuid'),
      Token: getCookieValue('token')
    }),
    []
  );

  useEffect(() => {
    const isLoggedIn = getCookieValue('is_logged_in');
    const userName = getCookieValue('user_name');
    const userDisplayName = getCookieValue('user_display_name');
    const userUuid = getCookieValue('user_uuid');
    const token = getCookieValue('token');
    if (checkEmpty(isLoggedIn) || checkEmpty(token) || checkEmpty(userUuid) || !isLoggedIn) {
      setRedirectUrl('/authentication/basic/login');
      setRedirect(true);
      return;
    }
    createCookie('is_logged_in', true, settings.cookieExpireTime);
    createCookie('user_name', userName, settings.cookieExpireTime);
    createCookie('user_display_name', userDisplayName, settings.cookieExpireTime);
    createCookie('user_uuid', userUuid, settings.cookieExpireTime);
    createCookie('token', token, settings.cookieExpireTime);
  });

  const showApiError = error => {
    toast.error(t(error && error.description ? error.description : 'API.ERROR'));
  };

  const flattenSpaces = (node, collector = []) => {
    if (!node) {
      return collector;
    }
    collector.push({ value: String(node.id), label: node.name });
    if (Array.isArray(node.children)) {
      node.children.forEach(child => flattenSpaces(child, collector));
    }
    return collector;
  };

  const loadSpaces = () => {
    fetch(`${APIBaseURL}/spaces/tree`, { method: 'GET', headers })
      .then(response => response.json().then(json => ({ ok: response.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        const options = flattenSpaces(json, []);
        setSpaces(options);
        if (options.length > 0) {
          setSelectedSpaceID(current => current || options[0].value);
        }
      })
      .catch(() => toast.error(t('API.ERROR')));
  };

  const loadAssets = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedYear) {
      params.append('year', selectedYear);
    }
    if (selectedSpaceID) {
      params.append('spaceid', selectedSpaceID);
    }
    fetch(`${APIBaseURL}/carbon-assets?${params.toString()}`, { method: 'GET', headers })
      .then(response => response.json().then(json => ({ ok: response.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        const rows = Array.isArray(json) ? json : [];
        setAssets(rows);
        setSelectedAsset(current => {
          if (current) {
            const found = rows.find(item => item.id === current.id);
            if (found) {
              return found;
            }
          }
          return rows.length > 0 ? rows[0] : null;
        });
      })
      .catch(() => toast.error(t('API.ERROR')))
      .finally(() => setLoading(false));
  };

  const loadOverview = assetId => {
    fetch(`${APIBaseURL}/carbon-assets/${assetId}/overview`, { method: 'GET', headers })
      .then(response => response.json().then(json => ({ ok: response.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        setOverview(json);
      })
      .catch(() => toast.error(t('API.ERROR')));
  };

  const loadMonthlyQuotas = assetId => {
    fetch(`${APIBaseURL}/carbon-assets/${assetId}/monthly-quotas`, { method: 'GET', headers })
      .then(response => response.json().then(json => ({ ok: response.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        setMonthlyQuotas(Array.isArray(json) ? json : []);
      })
      .catch(() => toast.error(t('API.ERROR')));
  };

  const loadMarketHistory = () => {
    setMarketLoading(true);
    fetch(`${APIBaseURL}/carbon-market-histories?pagesize=10`, { method: 'GET', headers })
      .then(response => response.json().then(json => ({ ok: response.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        setMarketHistory(Array.isArray(json.items) ? json.items : []);
        setMarketTotal(json.total || 0);
      })
      .catch(() => toast.error(t('API.ERROR')))
      .finally(() => setMarketLoading(false));
  };

  useEffect(() => {
    loadSpaces();
    loadMarketHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedSpaceID) {
      loadAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedSpaceID]);

  useEffect(() => {
    if (selectedAsset && selectedAsset.id) {
      loadOverview(selectedAsset.id);
      loadMonthlyQuotas(selectedAsset.id);
    } else {
      setOverview(null);
      setMonthlyQuotas([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset]);

  const openAddModal = () => {
    setEditingAsset(null);
    setAssetForm({ ...emptyAsset, accounting_year: selectedYear, space_id: selectedSpaceID || '' });
    setAssetModalOpen(true);
  };

  const openEditModal = asset => {
    setEditingAsset(asset);
    setAssetForm({
      space_id: String(asset.space_id),
      accounting_year: String(asset.accounting_year),
      government_quota: String(asset.government_quota || 0),
      previous_year_quota: String(asset.previous_year_quota || 0),
      purchased_quota: String(asset.purchased_quota || 0),
      sold_quota: String(asset.sold_quota || 0),
      own_ccer: String(asset.own_ccer || 0),
      purchased_ccer: String(asset.purchased_ccer || 0),
      sold_ccer: String(asset.sold_ccer || 0),
      purchased_green_certificate: String(asset.purchased_green_certificate || 0),
      sold_green_certificate: String(asset.sold_green_certificate || 0),
      retired_green_certificate: String(asset.retired_green_certificate || 0),
      data_status: asset.data_status || 'active',
      remark: asset.remark || ''
    });
    setAssetModalOpen(true);
  };

  const updateAssetForm = event => {
    const { name, value } = event.target;
    setAssetForm(current => ({ ...current, [name]: value }));
  };

  const saveAsset = () => {
    if (!assetForm.space_id || !assetForm.accounting_year) {
      toast.error(t('Please complete required fields'));
      return;
    }
    const url = editingAsset ? `${APIBaseURL}/carbon-assets/${editingAsset.id}` : `${APIBaseURL}/carbon-assets`;
    fetch(url, {
      method: editingAsset ? 'PUT' : 'POST',
      headers,
      body: JSON.stringify({ data: assetForm })
    })
      .then(response => response.text().then(text => ({ ok: response.ok, json: text ? JSON.parse(text) : {} })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        toast.success(t('Saved successfully'));
        setAssetModalOpen(false);
        loadAssets();
      })
      .catch(() => toast.error(t('API.ERROR')));
  };

  const deleteAsset = asset => {
    if (!window.confirm(t('Delete this record?'))) {
      return;
    }
    fetch(`${APIBaseURL}/carbon-assets/${asset.id}`, { method: 'DELETE', headers })
      .then(response => response.text().then(text => ({ ok: response.ok, json: text ? JSON.parse(text) : {} })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        toast.success(t('Deleted successfully'));
        loadAssets();
      })
      .catch(() => toast.error(t('API.ERROR')));
  };

  const openMonthlyModal = asset => {
    setSelectedAsset(asset);
    setMonthlyModalOpen(true);
  };

  const updateMonthlyQuota = (monthIndex, value) => {
    setMonthlyQuotas(current =>
      current.map(item => (item.month_of_year === monthIndex ? { ...item, quota_amount: value } : item))
    );
  };

  const averageDistribute = () => {
    if (!selectedAsset) {
      return;
    }
    const annualTotal = Number(selectedAsset.quota_total || 0);
    const avg = Math.floor(annualTotal / 12);
    const remainder = annualTotal - avg * 12;
    setMonthlyQuotas(current =>
      current.map((item, index) => ({
        ...item,
        quota_amount: String(avg + (index < remainder ? 1 : 0))
      }))
    );
  };

  const saveMonthlyQuotas = () => {
    if (!selectedAsset) {
      return;
    }
    if (monthlyTotal !== Number(selectedAsset.quota_total || 0)) {
      toast.error(t('Monthly quota total mismatch'));
      return;
    }
    fetch(`${APIBaseURL}/carbon-assets/${selectedAsset.id}/monthly-quotas`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        data: {
          monthly_quotas: monthlyQuotas.map(item => ({
            month_of_year: item.month_of_year,
            quota_amount: item.quota_amount,
            remark: item.remark || ''
          }))
        }
      })
    })
      .then(response => response.text().then(text => ({ ok: response.ok, json: text ? JSON.parse(text) : {} })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        toast.success(t('Saved successfully'));
        setMonthlyModalOpen(false);
        loadOverview(selectedAsset.id);
      })
      .catch(() => toast.error(t('API.ERROR')));
  };

  const uploadMarketHistory = () => {
    if (!uploadFile) {
      toast.error(t('Please Select'));
      return;
    }
    const formData = new FormData();
    formData.append('file', uploadFile);
    setImporting(true);
    fetch(`${APIBaseURL}/carbon-market-histories/import`, {
      method: 'POST',
      headers: {
        'User-UUID': getCookieValue('user_uuid'),
        Token: getCookieValue('token')
      },
      body: formData
    })
      .then(response => response.json().then(json => ({ ok: response.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        setImportResult(json);
        toast.success(t('Saved successfully'));
        loadMarketHistory();
      })
      .catch(() => toast.error(t('API.ERROR')))
      .finally(() => setImporting(false));
  };

  const renderSummaryCard = ({
    title,
    totalValue,
    unit,
    color,
    badgeText,
    detailText,
    items,
    onClick,
    valueFormatter
  }) => (
    <Col md={6} xl className="mb-3">
      <Card
        className="h-100 border-0"
        onClick={onClick}
        style={{
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
          overflow: 'hidden',
          cursor: onClick ? 'pointer' : 'default'
        }}
      >
        <div style={{ height: '4px', background: `linear-gradient(90deg, ${color}, ${color}cc)` }} />
        <CardBody style={{ padding: '14px 16px 12px' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div style={{ color: '#595959', fontSize: '13px', fontWeight: 500 }}>{title}</div>
            {badgeText && (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: `${color}1a`,
                  color,
                  fontSize: '11px',
                  fontWeight: 600
                }}
              >
                {badgeText}
              </span>
            )}
          </div>
          <div className="mb-2" style={{ color, fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.5px' }}>
            {(valueFormatter || formatValue)(totalValue)}
            <span className="text-muted ml-1" style={{ fontSize: '0.875rem', fontWeight: 400, letterSpacing: 0 }}>
              {unit}
            </span>
          </div>
          {items && items.length > 0 && (
            <div style={{ fontSize: '12px', color: '#8c8c8c', lineHeight: 1.8 }}>
              {items.map(item => (
                <span
                  key={item.label}
                  style={{
                    display: 'inline-block',
                    margin: '1px 6px 1px 0',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    backgroundColor: '#f5f5f5',
                    color: '#595959',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {item.label} <strong style={{ color: '#262626' }}>{formatValue(item.value)}</strong>
                </span>
              ))}
            </div>
          )}
          {detailText && <div style={{ fontSize: '12px', color: '#8c8c8c', lineHeight: 1.8 }}>{detailText}</div>}
        </CardBody>
      </Card>
    </Col>
  );

  const monthlyTotal = monthlyQuotas.reduce((sum, item) => sum + Number(item.quota_amount || 0), 0);

  const summaryCards = useMemo(() => {
    if (!overview || !selectedAsset) {
      return [];
    }

    return [
      {
        title: t('Allowance Quota'),
        totalValue: overview.cards.quota_total,
        unit: 'tCO2e',
        color: '#52c41a',
        badgeText: t('Monthly Quota'),
        onClick: () => openMonthlyModal(selectedAsset),
        items: [
          { label: t('Government Quota This Year'), value: selectedAsset.government_quota },
          { label: t('Previous Year Remaining Quota'), value: selectedAsset.previous_year_quota },
          { label: t('Purchased Quota This Year'), value: selectedAsset.purchased_quota },
          { label: t('Sold Quota This Year'), value: selectedAsset.sold_quota }
        ]
      },
      {
        title: 'CCER',
        totalValue: overview.cards.ccer_total,
        unit: 'tCO2e',
        color: '#1890ff',
        badgeText: 'CCER',
        items: [
          { label: t('Free CCER Asset'), value: selectedAsset.own_ccer },
          { label: t('Purchased CCER This Year'), value: selectedAsset.purchased_ccer },
          { label: t('Sold CCER This Year'), value: selectedAsset.sold_ccer }
        ]
      },
      {
        title: t('Green Certificate'),
        totalValue: overview.cards.green_certificate_total,
        unit: 'kWh',
        color: '#13c2c2',
        badgeText: t('Green Certificate'),
        items: [
          { label: t('Purchased Green Certificate This Year'), value: selectedAsset.purchased_green_certificate },
          { label: t('Sold Green Certificate This Year'), value: selectedAsset.sold_green_certificate },
          { label: t('Offset Green Certificate'), value: selectedAsset.retired_green_certificate }
        ]
      },
      {
        title: t('Annual Emissions'),
        totalValue: overview.cards.annual_emissions,
        unit: 'tCO2e',
        color: '#fa8c16',
        badgeText: t('Annual Emissions'),
        detailText: t('汇总企业空间下年排放量'),
        valueFormatter: formatFixed2
      },
      {
        title: t('Remaining Allowance'),
        totalValue: overview.cards.remaining_allowance,
        unit: 'tCO2e',
        color: '#722ed1',
        badgeText: t('Remaining Allowance'),
        detailText: '= ' + t('Allowance Quota') + ' + CCER - ' + t('Annual Emissions'),
        valueFormatter: formatFixed2
      }
    ];
  }, [overview, selectedAsset, t]);

  const assetStructureChartData = useMemo(() => {
    if (!overview) {
      return null;
    }

    return {
      labels: [t('Annual Emissions'), 'CCER', t('Green Certificate'), t('Allowance Quota')],
      datasets: [
        {
          data: [
            toNumber(overview.cards.annual_emissions),
            toNumber(overview.cards.ccer_total),
            toNumber(overview.cards.green_certificate_total),
            toNumber(overview.cards.quota_total)
          ],
          backgroundColor: [
            'rgba(250,140,22,0.75)',
            'rgba(24,144,255,0.75)',
            'rgba(19,194,194,0.75)',
            'rgba(82,196,26,0.75)'
          ],
          borderRadius: 4,
          barThickness: 24
        }
      ]
    };
  }, [overview, t]);

  const assetStructureChartOptions = useMemo(
    () => ({
      indexAxis: 'y',
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: context => formatValue(context.raw)
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: {
            color: '#f0f0f0'
          },
          ticks: {
            callback: value => formatValue(value)
          }
        },
        y: {
          grid: {
            display: false
          }
        }
      }
    }),
    []
  );

  const monthlyChartData = useMemo(() => {
    if (!overview) {
      return null;
    }

    return {
      labels: overview.monthly_chart.labels.map((label, index) => {
        const monthNumber = index + 1;
        return monthNumber.toString();
      }),
      datasets: [
        {
          label: t('Annual Emissions'),
          data: overview.monthly_chart.emissions.map(toNumber),
          backgroundColor: 'rgba(250,140,22,0.75)',
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.64,
          maxBarThickness: 24
        },
        {
          label: t('Allowance Quota'),
          data: overview.monthly_chart.quota.map(toNumber),
          backgroundColor: 'rgba(24,144,255,0.6)',
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.64,
          maxBarThickness: 24
        }
      ]
    };
  }, [overview, t]);

  const monthlyChartOptions = useMemo(
    () => ({
      maintainAspectRatio: false,
      responsive: true,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            boxWidth: 12,
            padding: 16
          }
        },
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: ${formatValue(context.raw)}`
          }
        }
      },
      scales: {
        x: {
          stacked: false,
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: '#f0f0f0'
          },
          ticks: {
            callback: value => formatValue(value)
          }
        }
      }
    }),
    []
  );

  const marketPreview = marketHistory;

  return (
    <Fragment>
      <Row noGutters className="mb-3">
        <Col>
          <Breadcrumb>
            <BreadcrumbItem>{t('Product Carbon Footprint')}</BreadcrumbItem>
            <BreadcrumbItem active>{t('Carbon Asset Management')}</BreadcrumbItem>
          </Breadcrumb>
        </Col>
      </Row>

      <Card className="mb-3 border-0" style={{ borderRadius: '8px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)' }}>
        <CardBody style={{ padding: '16px 20px' }}>
          <div className="d-flex flex-wrap justify-content-between align-items-center mb-3">
            <h4 className="mb-2 mb-md-0" style={{ fontSize: '16px', fontWeight: 600, color: '#262626' }}>
              {t('Carbon Asset Management')}
            </h4>
            <div className="d-flex flex-wrap">
              <Button color="primary" className="mr-2 mb-2 mb-md-0" onClick={loadAssets} disabled={loading}>
                {loading ? <Spinner size="sm" /> : t('Search')}
              </Button>
              <Button color="success" className="mr-2 mb-2 mb-md-0" onClick={openAddModal}>
                {t('Add')}
              </Button>
              <Button color="secondary" outline onClick={() => setImportModalOpen(true)}>
                {t('Import Market Data')}
              </Button>
            </div>
          </div>
          <Row form>
            <Col md={3}>
              <FormGroup>
                <Label>{t('Year')}</Label>
                <Input type="select" value={selectedYear} onChange={event => setSelectedYear(event.target.value)}>
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md={5}>
              <FormGroup>
                <Label>{t('Enterprise Space')}</Label>
                <Input type="select" value={selectedSpaceID} onChange={event => setSelectedSpaceID(event.target.value)}>
                  {spaces.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
          </Row>
        </CardBody>
      </Card>

      <Card className="mb-3 border-0" style={{ borderRadius: '6px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)' }}>
        <CardBody style={{ padding: 0 }}>
          <Table hover responsive className="mb-0" style={{ tableLayout: 'fixed' }}>
            <thead style={{ backgroundColor: '#fafafa' }}>
              <tr>
                <th className="border-top-0" style={{ ...annualListHeaderCellStyle, width: '8%' }}>
                  <div style={annualListHeaderTitleWrapStyle}>{t('Year')}</div>
                </th>
                <th className="border-top-0" style={{ ...annualListHeaderCellStyle, width: '28%' }}>
                  <div style={annualListHeaderTitleWrapStyle}>{t('Enterprise Space')}</div>
                </th>
                <th className="border-top-0" style={{ ...annualListHeaderCellStyle, width: '8%' }}>
                  <div style={annualListHeaderMetricWrapStyle}>
                    {t('Allowance Quota')}
                    <div style={annualListHeaderUnitStyle}>(tCO2e)</div>
                  </div>
                </th>
                <th className="border-top-0" style={{ ...annualListHeaderCellStyle, width: '7%' }}>
                  <div style={annualListHeaderMetricWrapStyle}>
                    CCER
                    <div style={annualListHeaderUnitStyle}>(tCO2e)</div>
                  </div>
                </th>
                <th className="border-top-0" style={{ ...annualListHeaderCellStyle, width: '8%' }}>
                  <div style={annualListHeaderMetricWrapStyle}>
                    {t('Green Certificate')}
                    <div style={annualListHeaderUnitStyle}>(kWh)</div>
                  </div>
                </th>
                <th className="border-top-0" style={{ ...annualListHeaderCellStyle, width: '11%' }}>
                  <div style={annualListHeaderMetricWrapStyle}>
                    {t('Annual Emissions')}
                    <div style={annualListHeaderUnitStyle}>(tCO2e)</div>
                  </div>
                </th>
                <th className="border-top-0" style={{ ...annualListHeaderCellStyle, width: '12%' }}>
                  <div style={annualListHeaderMetricWrapStyle}>
                    {t('Remaining Allowance')}
                    <div style={annualListHeaderUnitStyle}>(tCO2e)</div>
                  </div>
                </th>
                <th className="border-top-0" style={{ ...annualListHeaderCellStyle, width: '18%' }}>
                  <div style={annualListHeaderTitleWrapStyle}>{t('Operation')}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 && (
                <tr>
                  <td colSpan="8" className="text-center text-muted py-4">
                    {t('No Data')}
                  </td>
                </tr>
              )}
              {assets.map(asset => (
                <tr key={asset.id} className={selectedAsset && selectedAsset.id === asset.id ? 'table-primary' : ''}>
                  <td style={{ ...annualListCellStyle, color: '#1890ff', fontWeight: 500 }}>{asset.accounting_year}</td>
                  <td
                    style={{ ...annualListCellStyle, overflow: 'hidden', textOverflow: 'ellipsis' }}
                    title={asset.space_name || asset.space_id}
                  >
                    {asset.space_name || asset.space_id}
                  </td>
                  <td style={{ ...annualListCellStyle, color: '#1890ff', fontWeight: 500 }}>
                    {formatValue(asset.quota_total)}
                  </td>
                  <td style={annualListCellStyle}>{formatValue(asset.ccer_total)}</td>
                  <td style={annualListCellStyle}>{formatValue(asset.green_certificate_total)}</td>
                  <td style={annualListCellStyle}>
                    {overview && selectedAsset && selectedAsset.id === asset.id
                      ? formatFixed2(overview.cards.annual_emissions)
                      : '-'}
                  </td>
                  <td style={{ ...annualListCellStyle, color: '#1890ff', fontWeight: 500 }}>
                    {overview && selectedAsset && selectedAsset.id === asset.id
                      ? formatFixed2(overview.cards.remaining_allowance)
                      : '-'}
                  </td>
                  <td style={{ ...annualListCellStyle, whiteSpace: 'normal' }}>
                    <Button size="sm" color="link" className="p-0 mr-2" onClick={() => setSelectedAsset(asset)}>
                      {t('Details')}
                    </Button>
                    <Button size="sm" color="link" className="p-0 mr-2" onClick={() => openEditModal(asset)}>
                      {t('Edit')}
                    </Button>
                    <Button size="sm" color="link" className="p-0 mr-2" onClick={() => openMonthlyModal(asset)}>
                      {t('Monthly Quota')}
                    </Button>
                    <Button size="sm" color="link" className="p-0 text-danger" onClick={() => deleteAsset(asset)}>
                      {t('Delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      {overview && (
        <Fragment>
          <Row className="mb-1">{summaryCards.map(card => renderSummaryCard(card))}</Row>

          <Row className="mb-1">
            <Col xl={8} lg={7} className="mb-4 pr-xl-2">
              <Card className="h-100 border-0" style={chartPanelStyle}>
                <CardBody style={chartCardBodyStyle}>
                  <h4 style={sectionTitleStyle}>{t('Monthly Quota and Emissions')}</h4>
                  <div style={{ minHeight: '270px', paddingTop: '6px' }}>
                    {monthlyChartData && <Bar data={monthlyChartData} options={monthlyChartOptions} />}
                  </div>
                </CardBody>
              </Card>
            </Col>
            <Col xl={4} lg={5} className="mb-4 pl-xl-2">
              <Card className="h-100 border-0" style={chartPanelStyle}>
                <CardBody style={chartCardBodyStyle}>
                  <h4 style={sectionTitleStyle}>{t('Carbon Asset Structure')}</h4>
                  <div style={{ minHeight: '270px', paddingTop: '6px' }}>
                    {assetStructureChartData && (
                      <Bar data={assetStructureChartData} options={assetStructureChartOptions} />
                    )}
                  </div>
                </CardBody>
              </Card>
            </Col>
          </Row>

          <Card className="mb-3 border-0" style={chartPanelStyle}>
            <CardBody style={{ padding: '18px 20px 16px' }}>
              <div
                className="d-flex flex-wrap justify-content-between align-items-center mb-3"
                style={{ rowGap: '8px' }}
              >
                <h4 className="mb-0" style={sectionTitleStyle}>
                  {t('Market Supply and Demand')}
                </h4>
                <div className="text-muted small" style={{ fontSize: '12px' }}>
                  {t('Total')} {marketTotal}
                </div>
              </div>
              <div style={{ border: '1px solid #f0f0f0', borderRadius: '8px', overflowX: 'auto', overflowY: 'hidden' }}>
                <Table hover responsive size="sm" className="mb-0" style={{ minWidth: '1150px' }}>
                  <thead>
                    <tr>
                      <th style={{ ...marketHeaderCellStyle, width: '110px', minWidth: '110px' }}>{t('Date')}</th>
                      <th style={{ ...marketHeaderCellStyle, width: '90px', minWidth: '90px' }}>{t('Product')}</th>
                      <th style={{ ...marketHeaderCellStyle, width: '105px', minWidth: '105px' }}>
                        {t('Open Price')} (¥)
                      </th>
                      <th style={{ ...marketHeaderCellStyle, width: '105px', minWidth: '105px' }}>
                        {t('Close Price')} (¥)
                      </th>
                      <th style={{ ...marketHeaderCellStyle, width: '105px', minWidth: '105px' }}>
                        {t('High Price')} (¥)
                      </th>
                      <th style={{ ...marketHeaderCellStyle, width: '105px', minWidth: '105px' }}>
                        {t('Low Price')} (¥)
                      </th>
                      <th style={{ ...marketHeaderCellStyle, width: '100px', minWidth: '100px' }}>
                        {t('Change Value')} (¥)
                      </th>
                      <th style={{ ...marketHeaderCellStyle, width: '100px', minWidth: '100px' }}>
                        {t('Change Rate')} (%)
                      </th>
                      <th style={{ ...marketHeaderCellStyle, width: '115px', minWidth: '115px' }}>
                        {t('Trading Volume')}
                      </th>
                      <th style={{ ...marketHeaderCellStyle, width: '140px', minWidth: '140px' }}>
                        {t('Trading Amount')} (¥)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketLoading && (
                      <tr>
                        <td colSpan="10" className="text-center py-4">
                          <Spinner size="sm" />
                        </td>
                      </tr>
                    )}
                    {!marketLoading && marketPreview.length === 0 && (
                      <tr>
                        <td colSpan="10" className="text-center text-muted py-4">
                          {t('No Data')}
                        </td>
                      </tr>
                    )}
                    {marketPreview.map(item => {
                      const isPositive = toNumber(item.change_value) > 0;
                      const isNegative = toNumber(item.change_value) < 0;
                      const valueColor = isPositive ? '#f5222d' : isNegative ? '#52c41a' : '#262626';

                      return (
                        <tr key={item.id}>
                          <td style={{ ...marketCellStyle, width: '110px' }}>{item.trade_date}</td>
                          <td style={{ ...marketCellStyle, width: '90px', fontWeight: 500 }}>{item.variety_code}</td>
                          <td style={{ ...marketCellStyle, width: '105px' }}>{formatValue(item.open_price)}</td>
                          <td style={{ ...marketCellStyle, width: '105px' }}>{formatValue(item.close_price)}</td>
                          <td style={{ ...marketCellStyle, width: '105px' }}>{formatValue(item.high_price)}</td>
                          <td style={{ ...marketCellStyle, width: '105px' }}>{formatValue(item.low_price)}</td>
                          <td style={{ ...marketCellStyle, width: '100px', color: valueColor }}>
                            {formatSignedValue(item.change_value)}
                          </td>
                          <td style={{ ...marketCellStyle, width: '100px', color: valueColor }}>
                            {formatSignedValue(item.change_rate)}
                          </td>
                          <td style={{ ...marketCellStyle, width: '115px' }}>{formatValue(item.trading_volume)}</td>
                          <td style={{ ...marketCellStyle, width: '140px' }}>{formatValue(item.trading_amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
              <div
                className="text-muted mt-3"
                style={{ fontSize: '12px', borderTop: '1px solid #f0f0f0', paddingTop: '12px', marginTop: '14px' }}
              >
                {t('Data Source')}: {t('Import Market Data')}
              </div>
            </CardBody>
          </Card>
        </Fragment>
      )}

      <Modal isOpen={assetModalOpen} toggle={() => setAssetModalOpen(false)} size="lg">
        <ModalHeader toggle={() => setAssetModalOpen(false)}>
          {editingAsset ? t('Edit') : t('Add')} {t('Carbon Asset Management')}
        </ModalHeader>
        <ModalBody>
          <Row form>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Enterprise Space')} *</Label>
                <Input type="select" name="space_id" value={assetForm.space_id} onChange={updateAssetForm}>
                  {spaces.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Year')} *</Label>
                <Input
                  type="number"
                  name="accounting_year"
                  value={assetForm.accounting_year}
                  onChange={updateAssetForm}
                />
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Government Quota')}</Label>
                <Input
                  type="number"
                  name="government_quota"
                  value={assetForm.government_quota}
                  onChange={updateAssetForm}
                />
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Previous Year Quota')}</Label>
                <Input
                  type="number"
                  name="previous_year_quota"
                  value={assetForm.previous_year_quota}
                  onChange={updateAssetForm}
                />
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Purchased Quota')}</Label>
                <Input
                  type="number"
                  name="purchased_quota"
                  value={assetForm.purchased_quota}
                  onChange={updateAssetForm}
                />
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Sold Quota')}</Label>
                <Input type="number" name="sold_quota" value={assetForm.sold_quota} onChange={updateAssetForm} />
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Own CCER')}</Label>
                <Input type="number" name="own_ccer" value={assetForm.own_ccer} onChange={updateAssetForm} />
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Purchased CCER')}</Label>
                <Input
                  type="number"
                  name="purchased_ccer"
                  value={assetForm.purchased_ccer}
                  onChange={updateAssetForm}
                />
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Sold CCER')}</Label>
                <Input type="number" name="sold_ccer" value={assetForm.sold_ccer} onChange={updateAssetForm} />
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Purchased Green Certificate')}</Label>
                <Input
                  type="number"
                  name="purchased_green_certificate"
                  value={assetForm.purchased_green_certificate}
                  onChange={updateAssetForm}
                />
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Sold Green Certificate')}</Label>
                <Input
                  type="number"
                  name="sold_green_certificate"
                  value={assetForm.sold_green_certificate}
                  onChange={updateAssetForm}
                />
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Retired Green Certificate')}</Label>
                <Input
                  type="number"
                  name="retired_green_certificate"
                  value={assetForm.retired_green_certificate}
                  onChange={updateAssetForm}
                />
              </FormGroup>
            </Col>
            <Col md={12}>
              <FormGroup>
                <Label>{t('Remark')}</Label>
                <Input type="textarea" name="remark" value={assetForm.remark} onChange={updateAssetForm} />
              </FormGroup>
            </Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onClick={saveAsset}>
            {t('Save')}
          </Button>
          <Button color="secondary" onClick={() => setAssetModalOpen(false)}>
            {t('Cancel')}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={monthlyModalOpen} toggle={() => setMonthlyModalOpen(false)} size="lg">
        <ModalHeader toggle={() => setMonthlyModalOpen(false)}>{t('Monthly Quota')}</ModalHeader>
        <ModalBody>
          <div className="d-flex justify-content-between mb-3">
            <strong>
              {selectedAsset
                ? `${selectedAsset.space_name || selectedAsset.space_id} / ${selectedAsset.accounting_year}`
                : ''}
            </strong>
            <Button size="sm" color="success" onClick={averageDistribute}>
              {t('Average Distribution')}
            </Button>
          </div>
          <Table size="sm">
            <thead>
              <tr>
                <th>{t('Month')}</th>
                <th>{t('Allowance Quota')}</th>
              </tr>
            </thead>
            <tbody>
              {monthlyQuotas.map(item => (
                <tr key={item.month_of_year}>
                  <td>{item.month_of_year}</td>
                  <td>
                    <Input
                      type="number"
                      value={item.quota_amount}
                      onChange={event => updateMonthlyQuota(item.month_of_year, event.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="text-muted">
            {t('Total')}: {monthlyTotal}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onClick={saveMonthlyQuotas}>
            {t('Save')}
          </Button>
          <Button color="secondary" onClick={() => setMonthlyModalOpen(false)}>
            {t('Cancel')}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={importModalOpen} toggle={() => setImportModalOpen(false)}>
        <ModalHeader toggle={() => setImportModalOpen(false)}>{t('Import Market Data')}</ModalHeader>
        <ModalBody>
          <FormGroup>
            <Label>{t('Attachment')}</Label>
            <Input
              type="file"
              accept=".xlsx"
              onChange={event =>
                setUploadFile(event.target.files && event.target.files[0] ? event.target.files[0] : null)
              }
            />
          </FormGroup>
          {importResult && (
            <div className="text-muted small">
              <div>
                {t('Add')}: {importResult.inserted}
              </div>
              <div>
                {t('Edit')}: {importResult.updated}
              </div>
              <div>
                {t('Failed Rows')}: {importResult.failed}
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onClick={uploadMarketHistory} disabled={importing}>
            {importing ? <Spinner size="sm" /> : t('Upload')}
          </Button>
          <Button color="secondary" onClick={() => setImportModalOpen(false)}>
            {t('Cancel')}
          </Button>
        </ModalFooter>
      </Modal>
    </Fragment>
  );
};

export default withTranslation()(withRedirect(CarbonAssetManagement));
