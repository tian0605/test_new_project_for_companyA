import React, { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Badge,
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
import moment from 'moment';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { toast } from 'react-toastify';
import { withTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { APIBaseURL, settings } from '../../../config';
import { checkEmpty, createCookie, getCookieValue } from '../../../helpers/utils';
import withRedirect from '../../../hoc/withRedirect';
import StickyTable from '../common/StickyTable';
import './ProductCarbonFootprint.css';

const stages = [
  { value: 'raw_material_acquisition', label: 'Raw Material Acquisition Stage' },
  { value: 'manufacturing', label: 'Manufacturing Stage' },
  { value: 'distribution', label: 'Distribution Stage' },
  { value: 'use', label: 'Use Stage' },
  { value: 'end_of_life', label: 'End of Life Stage' }
];

const currentYear = Number(moment().format('YYYY'));

const getYearStart = year => `${year}-01-01`;
const getYearEnd = year => `${year}-12-31`;

const emptyFootprint = {
  product_id: '',
  accounting_year: currentYear,
  name: '',
  unit: '',
  accounting_date: moment().format('YYYY-MM-DD'),
  system_boundary: '',
  start_date: getYearStart(currentYear),
  end_date: getYearEnd(currentYear),
  production_quantity: '',
  functional_unit: '',
  data_status: 'active',
  remark: ''
};

const emptyActivity = {
  footprint_id: '',
  supply_id: '',
  stage: 'raw_material_acquisition',
  category: '',
  activity_name: '',
  activity_level: '',
  unit: '',
  factor: '',
  factor_source: '',
  remark: ''
};

const ProductCarbonFootprint = ({ setRedirect, setRedirectUrl, t }) => {
  const [products, setProducts] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [footprints, setFootprints] = useState([]);
  const [activities, setActivities] = useState([]);
  const [selectedProductID, setSelectedProductID] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedFootprint, setSelectedFootprint] = useState(null);
  const [expandedStageKeys, setExpandedStageKeys] = useState(stages.map(stage => stage.value));
  const [loading, setLoading] = useState(false);
  const [footprintModalOpen, setFootprintModalOpen] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editingFootprint, setEditingFootprint] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [footprintForm, setFootprintForm] = useState(emptyFootprint);
  const [activityForm, setActivityForm] = useState(emptyActivity);
  const [reportGeneratingID, setReportGeneratingID] = useState(null);

  useEffect(() => {
    document.body.classList.add('product-carbon-fluid-page');
    return () => document.body.classList.remove('product-carbon-fluid-page');
  }, []);

  useEffect(() => {
    const isLoggedIn = getCookieValue('is_logged_in');
    const userName = getCookieValue('user_name');
    const userDisplayName = getCookieValue('user_display_name');
    const userUuid = getCookieValue('user_uuid');
    const token = getCookieValue('token');
    if (checkEmpty(isLoggedIn) || checkEmpty(token) || checkEmpty(userUuid) || !isLoggedIn) {
      setRedirectUrl('/authentication/basic/login');
      setRedirect(true);
    } else {
      createCookie('is_logged_in', true, settings.cookieExpireTime);
      createCookie('user_name', userName, settings.cookieExpireTime);
      createCookie('user_display_name', userDisplayName, settings.cookieExpireTime);
      createCookie('user_uuid', userUuid, settings.cookieExpireTime);
      createCookie('token', token, settings.cookieExpireTime);
    }
  });

  const headers = useMemo(
    () => ({
      'Content-type': 'application/json',
      'User-UUID': getCookieValue('user_uuid'),
      Token: getCookieValue('token')
    }),
    []
  );

  const showApiError = error => {
    toast.error(t(error && error.description ? error.description : 'API.ERROR'));
  };

  const apiJson = (url, options = {}) =>
    fetch(url, { headers, ...options })
      .then(response => response.text().then(text => ({ ok: response.ok, json: text ? JSON.parse(text) : {} })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          throw new Error(json.description || 'API.ERROR');
        }
        return json;
      });

  const loadProducts = () => {
    apiJson(`${APIBaseURL}/product-carbon-products`)
      .then(json => {
        const rows = Array.isArray(json) ? json : [];
        setProducts(rows);
        if (selectedProductID && !rows.some(product => String(product.id) === String(selectedProductID))) {
          setSelectedProductID('');
        }
      })
      .catch(() => {
        setProducts([]);
        setSelectedProductID('');
      });
  };

  const loadSupplies = () => {
    apiJson(`${APIBaseURL}/product-carbon-supplies`).then(json => setSupplies(Array.isArray(json) ? json : [])).catch(() => {});
  };

  const loadFootprints = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedProductID) {
      params.append('productid', selectedProductID);
    }
    apiJson(`${APIBaseURL}/product-carbon-footprints?${params.toString()}`)
      .then(json => {
        const rows = Array.isArray(json) ? json : [];
        setFootprints(rows);
        if (selectedFootprint) {
          const refreshed = rows.find(item => item.id === selectedFootprint.id);
          setSelectedFootprint(refreshed || (rows.length > 0 ? rows[0] : null));
        } else {
          setSelectedFootprint(rows.length > 0 ? rows[0] : null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadActivities = footprint => {
    if (!footprint) {
      setActivities([]);
      return;
    }
    apiJson(`${APIBaseURL}/product-carbon-activities?footprintid=${footprint.id}`)
      .then(json => setActivities(Array.isArray(json.activities) ? json.activities : []))
      .catch(() => setActivities([]));
  };

  useEffect(() => {
    loadProducts();
    loadSupplies();
    loadFootprints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadFootprints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductID]);

  useEffect(() => {
    loadActivities(selectedFootprint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFootprint && selectedFootprint.id]);

  const openAddFootprint = () => {
    if (products.length === 0) {
      toast.error(t('No Product Available'));
      return;
    }
    const product = products.find(item => String(item.id) === String(selectedProductID)) || products[0];
    setEditingFootprint(null);
    setFootprintForm({
      ...emptyFootprint,
      product_id: product ? product.id : '',
      unit: product ? product.unit_of_measure : '',
      functional_unit: product ? product.unit_of_measure : '',
      name: product ? `${product.name} ${currentYear}` : ''
    });
    setFootprintModalOpen(true);
  };

  const openEditFootprint = footprint => {
    setEditingFootprint(footprint);
    setFootprintForm({ ...emptyFootprint, ...footprint });
    setFootprintModalOpen(true);
  };

  const updateFootprintForm = event => {
    const { name, value } = event.target;
    setFootprintForm(current => {
      const next = { ...current, [name]: value };
      if (name === 'accounting_year') {
        next.start_date = getYearStart(value);
        next.end_date = getYearEnd(value);
      }
      if (name === 'product_id') {
        const product = products.find(item => String(item.id) === String(value));
        next.unit = product ? product.unit_of_measure : next.unit;
        next.functional_unit = product ? product.unit_of_measure : next.functional_unit;
        if (product && !next.name) {
          next.name = `${product.name} ${next.accounting_year || currentYear}`;
        }
      }
      return next;
    });
  };

  const validateFootprint = () => {
    if (!footprintForm.product_id || !footprintForm.accounting_year || !footprintForm.name || !footprintForm.functional_unit) {
      toast.error(t('Please complete required fields'));
      return false;
    }
    if (Number(footprintForm.production_quantity) <= 0) {
      toast.error(t('Production quantity must be greater than 0'));
      return false;
    }
    return true;
  };

  const saveFootprint = () => {
    if (!validateFootprint()) {
      return;
    }
    const url = editingFootprint
      ? `${APIBaseURL}/product-carbon-footprints/${editingFootprint.id}`
      : `${APIBaseURL}/product-carbon-footprints`;
    apiJson(url, {
      method: editingFootprint ? 'PUT' : 'POST',
      body: JSON.stringify({ data: footprintForm })
    })
      .then(() => {
        toast.success(t('Saved successfully'));
        setFootprintModalOpen(false);
        loadFootprints();
      })
      .catch(() => {});
  };

  const deleteFootprint = footprint => {
    if (!window.confirm(t('Delete this record?'))) {
      return;
    }
    apiJson(`${APIBaseURL}/product-carbon-footprints/${footprint.id}`, { method: 'DELETE' })
      .then(() => {
        toast.success(t('Deleted successfully'));
        if (selectedFootprint && selectedFootprint.id === footprint.id) {
          setSelectedFootprint(null);
        }
        loadFootprints();
      })
      .catch(() => {});
  };

  const openAddActivity = stage => {
    if (!selectedFootprint) {
      toast.error(t('Please select footprint'));
      return;
    }
    setEditingActivity(null);
    setActivityForm({
      ...emptyActivity,
      footprint_id: selectedFootprint.id,
      stage,
      unit: selectedFootprint.unit || selectedFootprint.product_unit || ''
    });
    setActivityModalOpen(true);
  };

  const openEditActivity = activity => {
    setEditingActivity(activity);
    setActivityForm({ ...emptyActivity, ...activity, supply_id: activity.supply_id || '' });
    setActivityModalOpen(true);
  };

  const updateActivityForm = event => {
    const { name, value } = event.target;
    setActivityForm(current => {
      const next = { ...current, [name]: value };
      if (name === 'supply_id') {
        const supply = supplies.find(item => String(item.id) === String(value));
        if (supply) {
          next.category = supply.category || '';
          next.activity_name = supply.material_name || '';
          next.unit = selectedFootprint ? selectedFootprint.unit || selectedFootprint.product_unit || '' : next.unit;
          next.factor = supply.carbon_footprint_value || '';
          next.factor_source = supply.supplier_name || '';
        } else {
          next.category = '';
          next.activity_name = '';
          next.factor = '';
          next.factor_source = '';
          next.unit = selectedFootprint ? selectedFootprint.unit || selectedFootprint.product_unit || '' : '';
        }
      }
      return next;
    });
  };

  const formatNumber = value => (Number.isFinite(Number(value)) ? Number(value).toFixed(6) : '0.000000');
  const escapeHtml = value => String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const safeFileName = value => String(value || 'product-carbon-footprint')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'product-carbon-footprint';
  const getContributionUnit = footprint => `kgCO2e/${footprint && footprint.functional_unit ? footprint.functional_unit : t('Product Unit')}`;
  const getActivityContributionForFootprint = (footprint, emissionAmount) => {
    const productionQuantity = Number(footprint && footprint.production_quantity ? footprint.production_quantity : 0);
    return productionQuantity > 0 ? Number(emissionAmount || 0) / productionQuantity : 0;
  };
  const getActivityContribution = emissionAmount => getActivityContributionForFootprint(selectedFootprint, emissionAmount);
  const activityEmissionAmount = Number(activityForm.activity_level || 0) * Number(activityForm.factor || 0);
  const activityContribution = getActivityContribution(activityEmissionAmount);

  const validateActivity = () => {
    if (!activityForm.stage || !activityForm.category || !activityForm.activity_name || !activityForm.unit) {
      toast.error(t('Please complete required fields'));
      return false;
    }
    if (Number(activityForm.activity_level) <= 0) {
      toast.error(t('Activity level must be greater than 0'));
      return false;
    }
    if (Number(activityForm.factor) < 0) {
      toast.error(t('Factor must be greater than or equal to 0'));
      return false;
    }
    return true;
  };

  const saveActivity = () => {
    if (!validateActivity()) {
      return;
    }
    const url = editingActivity
      ? `${APIBaseURL}/product-carbon-activities/${editingActivity.id}`
      : `${APIBaseURL}/product-carbon-activities`;
    apiJson(url, {
      method: editingActivity ? 'PUT' : 'POST',
      body: JSON.stringify({ data: { ...activityForm, footprint_id: selectedFootprint.id } })
    })
      .then(() => {
        toast.success(t('Saved successfully'));
        setActivityModalOpen(false);
        loadActivities(selectedFootprint);
        loadFootprints();
      })
      .catch(() => {});
  };

  const deleteActivity = activity => {
    if (!window.confirm(t('Delete this record?'))) {
      return;
    }
    apiJson(`${APIBaseURL}/product-carbon-activities/${activity.id}`, { method: 'DELETE' })
      .then(() => {
        toast.success(t('Deleted successfully'));
        loadActivities(selectedFootprint);
        loadFootprints();
      })
      .catch(() => {});
  };

  const getActivitiesByStage = stage => activities.filter(activity => activity.stage === stage);
  const getActivityContributionValue = activity => getActivityContribution(activity.emission_amount);
  const getStageSubtotal = stage => getActivitiesByStage(stage).reduce((sum, activity) => sum + getActivityContributionValue(activity), 0);
  const getTotal = () => activities.reduce((sum, activity) => sum + getActivityContributionValue(activity), 0);
  const toggleStage = stage => {
    setExpandedStageKeys(current => (current.includes(stage) ? current.filter(item => item !== stage) : [...current, stage]));
  };
  const total = getTotal();
  const contributionUnit = getContributionUnit(selectedFootprint);
  const selectedProduct = products.find(product => String(product.id) === String(selectedProductID));
  const footprintYearOptions = Array.from(new Set(footprints.map(footprint => footprint.accounting_year).filter(Boolean))).sort((a, b) => Number(b) - Number(a));
  const filteredFootprints = selectedYear ? footprints.filter(footprint => String(footprint.accounting_year) === String(selectedYear)) : footprints;
  const getFootprintTotalValue = footprint => (selectedFootprint && footprint.id === selectedFootprint.id ? total : Number(footprint.total_carbon_footprint || 0));
  const getReportActivities = footprint => {
    if (selectedFootprint && footprint && selectedFootprint.id === footprint.id) {
      return Promise.resolve(activities);
    }
    return apiJson(`${APIBaseURL}/product-carbon-activities?footprintid=${footprint.id}`)
      .then(json => (Array.isArray(json.activities) ? json.activities : []));
  };
  const buildReportElement = (footprint, reportActivities) => {
    const reportTotal = reportActivities.reduce((sum, activity) => sum + getActivityContributionForFootprint(footprint, activity.emission_amount), 0);
    const html = `
      <div style="width: 1080px; padding: 42px; background: #ffffff; color: #111827; font-family: Arial, 'Microsoft YaHei', 'PingFang SC', sans-serif;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #16a34a; padding-bottom: 18px; margin-bottom: 24px;">
          <div>
            <div style="font-size: 14px; color: #16a34a; font-weight: 700; letter-spacing: 0;">${escapeHtml(t('Product Carbon Footprint Accounting'))}</div>
            <div style="font-size: 28px; color: #111827; font-weight: 800; margin-top: 8px;">${escapeHtml(footprint.name || '-')}</div>
          </div>
          <div style="font-size: 13px; color: #6b7280; text-align: right;">${escapeHtml(moment().format('YYYY-MM-DD HH:mm'))}</div>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 13px; table-layout: fixed;">
          <tbody>
            <tr>
              <th style="width: 16%; padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #4b5563; text-align: left;">${escapeHtml(t('Product'))}</th>
              <td style="width: 34%; padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(footprint.product_name || '-')}</td>
              <th style="width: 16%; padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #4b5563; text-align: left;">${escapeHtml(t('Year'))}</th>
              <td style="width: 34%; padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(footprint.accounting_year || '-')}</td>
            </tr>
            <tr>
              <th style="padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #4b5563; text-align: left;">${escapeHtml(t('Start Date'))}</th>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(footprint.start_date || '-')}</td>
              <th style="padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #4b5563; text-align: left;">${escapeHtml(t('End Date'))}</th>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(footprint.end_date || '-')}</td>
            </tr>
            <tr>
              <th style="padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #4b5563; text-align: left;">${escapeHtml(t('System Boundary'))}</th>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(footprint.system_boundary || '-')}</td>
              <th style="padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #4b5563; text-align: left;">${escapeHtml(t('Functional Unit'))}</th>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(footprint.functional_unit || '-')}</td>
            </tr>
            <tr>
              <th style="padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #4b5563; text-align: left;">${escapeHtml(t('Production Quantity'))}</th>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(`${footprint.production_quantity || 0} ${footprint.unit || ''}`)}</td>
              <th style="padding: 10px; border: 1px solid #e5e7eb; background: #f9fafb; color: #4b5563; text-align: left;">${escapeHtml(t('Total Carbon Footprint'))}</th>
              <td style="padding: 10px; border: 1px solid #e5e7eb; color: #16a34a; font-weight: 800;">${escapeHtml(`${formatNumber(reportTotal)} ${getContributionUnit(footprint)}`)}</td>
            </tr>
          </tbody>
        </table>
        ${stages.map(stage => {
          const stageActivities = reportActivities.filter(activity => activity.stage === stage.value);
          const stageSubtotal = stageActivities.reduce((sum, activity) => sum + getActivityContributionForFootprint(footprint, activity.emission_amount), 0);
          const rows = stageActivities.length > 0 ? stageActivities.map((activity, index) => {
            const contributionValue = getActivityContributionForFootprint(footprint, activity.emission_amount);
            const share = stageSubtotal > 0 ? (contributionValue / stageSubtotal) * 100 : 0;
            return `
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${index + 1}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(activity.category || '-')}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(activity.activity_name || '-')}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">${escapeHtml(formatNumber(activity.activity_level))}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(activity.unit || '-')}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">${escapeHtml(formatNumber(activity.factor))}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">${escapeHtml(formatNumber(activity.emission_amount))}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(activity.factor_source || '-')}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">${escapeHtml(`${formatNumber(contributionValue)} ${getContributionUnit(footprint)}`)}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">${escapeHtml(formatNumber(share))}%</td>
              </tr>`;
          }).join('') : `
              <tr>
                <td colspan="10" style="padding: 14px; border: 1px solid #e5e7eb; color: #6b7280; text-align: center;">${escapeHtml(t('No Data'))}</td>
              </tr>`;
          return `
            <div style="margin-top: 20px; page-break-inside: avoid;">
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
                <h2 style="margin: 0; color: #111827; font-size: 18px;">${escapeHtml(t(stage.label))}</h2>
                <div style="color: #16a34a; font-weight: 800; font-size: 13px;">${escapeHtml(`${formatNumber(stageSubtotal)} ${getContributionUnit(footprint)}`)}</div>
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed;">
                <thead>
                  <tr style="background: #f9fafb; color: #4b5563;">
                    <th style="width: 4%; padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(t('No.'))}</th>
                    <th style="width: 10%; padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(t('Category'))}</th>
                    <th style="width: 14%; padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(t('Activity Name'))}</th>
                    <th style="width: 10%; padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(t('Activity Level'))}</th>
                    <th style="width: 7%; padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(t('Unit'))}</th>
                    <th style="width: 8%; padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(t('Emission Factor'))}</th>
                    <th style="width: 10%; padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(t('Emission Amount'))} (kgCO2e)</th>
                    <th style="width: 10%; padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(t('Factor Source'))}</th>
                    <th style="width: 17%; padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(t('Carbon Footprint Contribution'))}</th>
                    <th style="width: 10%; padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(t('Share'))}</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`;
        }).join('')}
      </div>`;
    const reportElement = document.createElement('div');
    reportElement.innerHTML = html;
    return reportElement.firstElementChild;
  };
  const downloadReportAsPdf = (reportElement, fileName) => {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-10000px';
    container.style.top = '0';
    container.appendChild(reportElement);
    document.body.appendChild(container);
    return html2canvas(reportElement, { backgroundColor: '#ffffff', scale: 2, useCORS: true })
      .then(canvas => {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 8;
        const imageWidth = pageWidth - margin * 2;
        const imageHeight = (canvas.height * imageWidth) / canvas.width;
        const pageContentHeight = pageHeight - margin * 2;
        const imageData = canvas.toDataURL('image/jpeg', 0.98);
        let printedHeight = 0;
        pdf.addImage(imageData, 'JPEG', margin, margin, imageWidth, imageHeight);
        printedHeight += pageContentHeight;
        while (printedHeight < imageHeight) {
          pdf.addPage();
          pdf.addImage(imageData, 'JPEG', margin, margin - printedHeight, imageWidth, imageHeight);
          printedHeight += pageContentHeight;
        }
        pdf.save(fileName);
      })
      .finally(() => {
        document.body.removeChild(container);
      });
  };
  const generateFootprintReport = footprint => {
    if (!footprint) {
      return;
    }
    setReportGeneratingID(footprint.id);
    getReportActivities(footprint)
      .then(reportActivities => {
        const reportElement = buildReportElement(footprint, reportActivities);
        const fileName = `${safeFileName(`${footprint.product_name || footprint.name || 'product'}-${footprint.accounting_year || currentYear}`)}.pdf`;
        return downloadReportAsPdf(reportElement, fileName);
      })
      .catch(() => toast.error(t('API.ERROR')))
      .finally(() => setReportGeneratingID(null));
  };
  const pageTitle = selectedFootprint ? selectedFootprint.name : t('Product Carbon Footprint Accounting');

  return (
    <Fragment>
      <div className="product-carbon-workbench">
      <Row noGutters className="mb-3">
        <Col>
          <Breadcrumb className="product-carbon-breadcrumb">
            <BreadcrumbItem>{t('Product Carbon Footprint')}</BreadcrumbItem>
            <BreadcrumbItem active>{t('Product Carbon Footprint Accounting')}</BreadcrumbItem>
          </Breadcrumb>
        </Col>
      </Row>

      <div className="product-carbon-page-title">{pageTitle}</div>

      <Card className="product-carbon-panel mb-3">
        <CardBody>
          <div className="product-carbon-card-title">{t('Annual Footprint List')}</div>
          <div className="product-carbon-toolbar">
            <div className="product-carbon-filter">
              <Input type="select" value={selectedProductID} onChange={event => setSelectedProductID(event.target.value)}>
                <option value="">{t('All')}</option>
                {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
              </Input>
            </div>
            <div className="product-carbon-filter product-carbon-year-filter">
              <Input type="select" value={selectedYear} onChange={event => setSelectedYear(event.target.value)}>
                <option value="">{t('All')} {t('Year')}</option>
                {footprintYearOptions.map(year => <option key={year} value={year}>{year}</option>)}
              </Input>
            </div>
            <Button color="secondary" outline size="sm" className="product-carbon-action" onClick={loadFootprints} disabled={loading}>
              {loading ? <Spinner size="sm" /> : <FontAwesomeIcon icon="redo" />}<span>{t('Refresh')}</span>
            </Button>
            <Button color="success" size="sm" className="product-carbon-action" onClick={openAddFootprint}>
              <FontAwesomeIcon icon="plus" /><span>{t('Add')}</span>
            </Button>
          </div>
          <div className="product-carbon-table-wrap">
              <StickyTable>
              <Table hover className="mb-0 product-carbon-table">
                <thead>
                  <tr>
                    <th>{t('No.')}</th>
                    <th>{t('Name')}</th>
                    <th>{t('Product')}</th>
                    <th>{t('Year')}</th>
                    <th>{t('Start Date')}</th>
                    <th>{t('End Date')}</th>
                    <th>{t('Production Quantity')}</th>
                    <th>{t('Functional Unit')}</th>
                    <th>{t('System Boundary')}</th>
                    <th>{t('Total Carbon Footprint')}</th>
                    <th>{t('Status')}</th>
                    <th>{t('Operation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFootprints.length === 0 && <tr><td colSpan="12" className="product-carbon-empty-cell">{t('No Data')}</td></tr>}
                  {filteredFootprints.map((footprint, index) => (
                    <tr key={footprint.id} className={selectedFootprint && selectedFootprint.id === footprint.id ? 'product-carbon-row-active' : ''}>
                      <td className="product-carbon-mono">{index + 1}</td>
                      <td>{footprint.name}</td>
                      <td>{footprint.product_name}</td>
                      <td className="product-carbon-mono">{footprint.accounting_year}</td>
                      <td className="product-carbon-mono">{footprint.start_date}</td>
                      <td className="product-carbon-mono">{footprint.end_date}</td>
                      <td className="product-carbon-mono">{footprint.production_quantity} {footprint.unit}</td>
                      <td>{footprint.functional_unit}</td>
                      <td>{footprint.system_boundary || '-'}</td>
                      <td className="product-carbon-mono">{formatNumber(getFootprintTotalValue(footprint))} {getContributionUnit(footprint)}</td>
                      <td><Badge color={footprint.data_status === 'active' ? 'success' : 'secondary'}>{t(footprint.data_status)}</Badge></td>
                      <td className="text-nowrap">
                        <Button size="sm" color="link" className="p-0 mr-2" onClick={() => setSelectedFootprint(footprint)}>{t('Details')}</Button>
                        <Button size="sm" color="link" className="p-0 mr-2" onClick={() => generateFootprintReport(footprint)} disabled={reportGeneratingID === footprint.id}>
                          {reportGeneratingID === footprint.id ? <Spinner size="sm" /> : t('Generate Report')}
                        </Button>
                        <Button size="sm" color="link" className="p-0 mr-2" onClick={() => openEditFootprint(footprint)}>{t('Edit')}</Button>
                        <Button size="sm" color="link" className="p-0 text-danger" onClick={() => deleteFootprint(footprint)}>{t('Delete')}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              </StickyTable>
          </div>
        </CardBody>
          </Card>

      {selectedFootprint && (
        <div className="product-carbon-lifecycle">
          <div className="product-carbon-section-header">
            <div className="product-carbon-section-info">
              <span className="product-carbon-section-title">{t('Lifecycle Carbon Footprint Report')}</span>
              <span className="product-carbon-section-meta">{t('Start Date')} {selectedFootprint.start_date} {t('End Date')} {selectedFootprint.end_date}</span>
            </div>
            <div className="product-carbon-total-box">
              <span>{t('Total Carbon Footprint')}</span>
              <strong className="product-carbon-mono">{formatNumber(total)}</strong>
              <small>{contributionUnit}</small>
            </div>
          </div>
            {stages.map(stage => {
              const rows = getActivitiesByStage(stage.value);
              const subtotal = getStageSubtotal(stage.value);
              const isOpen = expandedStageKeys.includes(stage.value);
              return (
                <div key={stage.value} className="product-carbon-phase-block">
                  <div className={`product-carbon-phase-header${isOpen ? ' open' : ''}`} onClick={() => toggleStage(stage.value)} role="button" tabIndex="0" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') toggleStage(stage.value); }}>
                    <div className="product-carbon-phase-left">
                      <span className="product-carbon-phase-arrow"><FontAwesomeIcon icon="caret-right" /></span>
                      <span className="product-carbon-phase-name">{t(stage.label)}</span>
                      <span className="product-carbon-phase-sum product-carbon-mono">{formatNumber(subtotal)} {contributionUnit}</span>
                    </div>
                    <Button size="sm" color="success" className="product-carbon-action" onClick={event => { event.stopPropagation(); openAddActivity(stage.value); }}>
                        <FontAwesomeIcon icon="plus" /><span>{t('Add Activity')}</span>
                      </Button>
                  </div>
                  {isOpen && (
                  <div className="product-carbon-phase-body">
                  <StickyTable>
                  <Table bordered size="sm" className="product-carbon-table product-carbon-activity-table">
                    <thead>
                      <tr>
                        <th>{t('No.')}</th>
                        <th>{t('Category')}</th>
                        <th>{t('Activity Name')}</th>
                        <th>{t('Activity Level')}</th>
                        <th>{t('Unit')}</th>
                        <th>{t('Factor')}</th>
                        <th>{t('Emission Amount')} (kgCO2e)</th>
                        <th>{t('Factor Source')}</th>
                        <th>{t('Carbon Footprint Contribution')}</th>
                        <th>{t('Share')}</th>
                        <th>{t('Operation')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && <tr><td colSpan="11" className="product-carbon-empty-cell">{t('No Data')}</td></tr>}
                      {rows.map((activity, index) => (
                        <tr key={activity.id}>
                          <td className="product-carbon-mono">{index + 1}</td>
                          <td>{activity.category}</td>
                          <td>{activity.activity_name}</td>
                          <td className="product-carbon-mono">{activity.activity_level}</td>
                          <td>{activity.unit}</td>
                          <td className="product-carbon-mono">{activity.factor}</td>
                          <td className="product-carbon-mono">{formatNumber(activity.emission_amount)}</td>
                          <td>{activity.factor_source}</td>
                          <td className="product-carbon-mono">{formatNumber(getActivityContributionValue(activity))}</td>
                          <td>
                            <div className="product-carbon-progress">
                              <span><i style={{ width: `${subtotal > 0 ? Math.min((getActivityContributionValue(activity) / subtotal) * 100, 100) : 0}%` }} /></span>
                              <em className="product-carbon-mono">{subtotal > 0 ? `${((getActivityContributionValue(activity) / subtotal) * 100).toFixed(2)}%` : '0.00%'}</em>
                            </div>
                          </td>
                          <td className="text-nowrap">
                            <Button size="sm" color="link" className="p-0 mr-2" onClick={() => openEditActivity(activity)}>{t('Edit')}</Button>
                            <Button size="sm" color="link" className="p-0 text-danger" onClick={() => deleteActivity(activity)}>{t('Delete')}</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  </StickyTable>
                  </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      <Modal isOpen={footprintModalOpen} toggle={() => setFootprintModalOpen(false)} size="lg">
        <ModalHeader toggle={() => setFootprintModalOpen(false)}>{editingFootprint ? t('Edit Footprint') : t('Add Footprint')}</ModalHeader>
        <ModalBody>
          <Row form>
            <Col md={6}><FormGroup><Label>{t('Product')} *</Label><Input type="select" name="product_id" value={footprintForm.product_id} onChange={updateFootprintForm}><option value="">{t('Please Select Product')}</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</Input></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Year')} *</Label><Input type="number" name="accounting_year" value={footprintForm.accounting_year} onChange={updateFootprintForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Name')} *</Label><Input name="name" value={footprintForm.name} onChange={updateFootprintForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Accounting Date')}</Label><Input type="date" name="accounting_date" value={footprintForm.accounting_date} onChange={updateFootprintForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Start Date')}</Label><Input type="date" name="start_date" value={footprintForm.start_date} onChange={updateFootprintForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('End Date')}</Label><Input type="date" name="end_date" value={footprintForm.end_date} onChange={updateFootprintForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('System Boundary')}</Label><Input name="system_boundary" value={footprintForm.system_boundary} onChange={updateFootprintForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Unit')}</Label><Input name="unit" value={footprintForm.unit} onChange={updateFootprintForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Production Quantity')} *</Label><Input type="number" name="production_quantity" value={footprintForm.production_quantity} onChange={updateFootprintForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Functional Unit')} *</Label><Input name="functional_unit" value={footprintForm.functional_unit} onChange={updateFootprintForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Status')}</Label><Input type="select" name="data_status" value={footprintForm.data_status} onChange={updateFootprintForm}><option value="active">{t('active')}</option><option value="draft">{t('draft')}</option><option value="void">{t('void')}</option></Input></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Total Carbon Footprint')}</Label><Input value={editingFootprint ? editingFootprint.total_carbon_footprint : 0} disabled /></FormGroup></Col>
            <Col md={12}><FormGroup><Label>{t('Remark')}</Label><Input type="textarea" name="remark" value={footprintForm.remark} onChange={updateFootprintForm} /></FormGroup></Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onClick={saveFootprint}>{t('Save')}</Button>
          <Button color="secondary" onClick={() => setFootprintModalOpen(false)}>{t('Cancel')}</Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={activityModalOpen} toggle={() => setActivityModalOpen(false)} size="lg">
        <ModalHeader toggle={() => setActivityModalOpen(false)}>{editingActivity ? t('Edit Activity') : t('Add Activity')}</ModalHeader>
        <ModalBody>
          <Row form>
            <Col md={6}><FormGroup><Label>{t('Stage')} *</Label><Input type="select" name="stage" value={activityForm.stage} onChange={updateActivityForm}>{stages.map(stage => <option key={stage.value} value={stage.value}>{t(stage.label)}</option>)}</Input></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Related Supply Material')}</Label><Input type="select" name="supply_id" value={activityForm.supply_id || ''} onChange={updateActivityForm}><option value="">{t('None')}</option>{supplies.map(supply => <option key={supply.id} value={supply.id}>{supply.material_name} - {supply.supplier_name}</option>)}</Input></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Category')} *</Label><Input name="category" value={activityForm.category} onChange={updateActivityForm} disabled /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Activity Name')} *</Label><Input name="activity_name" value={activityForm.activity_name} onChange={updateActivityForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Activity Level')} *</Label><Input type="number" name="activity_level" value={activityForm.activity_level} onChange={updateActivityForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Unit')} *</Label><Input name="unit" value={activityForm.unit} onChange={updateActivityForm} disabled /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Factor')} *</Label><Input type="number" name="factor" value={activityForm.factor} onChange={updateActivityForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Factor Source')}</Label><Input name="factor_source" value={activityForm.factor_source} onChange={updateActivityForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Emission Amount')} (kgCO2e)</Label><Input value={formatNumber(activityEmissionAmount)} disabled /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Carbon Footprint Contribution')}</Label><Input value={`${formatNumber(activityContribution)} ${contributionUnit}`} disabled /></FormGroup></Col>
            <Col md={12}><FormGroup><Label>{t('Remark')}</Label><Input type="textarea" name="remark" value={activityForm.remark} onChange={updateActivityForm} /></FormGroup></Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onClick={saveActivity}>{t('Save')}</Button>
          <Button color="secondary" onClick={() => setActivityModalOpen(false)}>{t('Cancel')}</Button>
        </ModalFooter>
      </Modal>
      </div>
    </Fragment>
  );
};

export default withTranslation()(withRedirect(ProductCarbonFootprint));
