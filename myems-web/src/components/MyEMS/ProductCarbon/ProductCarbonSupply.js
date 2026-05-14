import React, { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  Col,
  Form,
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
import { toast } from 'react-toastify';
import { withTranslation } from 'react-i18next';
import { APIBaseURL, settings } from '../../../config';
import { checkEmpty, createCookie, getCookieValue } from '../../../helpers/utils';
import withRedirect from '../../../hoc/withRedirect';
import StickyTable from '../common/StickyTable';

const emptySupply = {
  category: '',
  supplier_name: '',
  supplier_address: '',
  material_name: '',
  specification: '',
  boundary: '',
  carbon_footprint_value: '',
  carbon_footprint_unit: 'kgCO2e',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  remark: ''
};

const ProductCarbonSupply = ({ setRedirect, setRedirectUrl, t }) => {
  const [supplies, setSupplies] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupply, setEditingSupply] = useState(null);
  const [formData, setFormData] = useState(emptySupply);

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

  const loadSupplies = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword.trim()) {
      params.append('q', keyword.trim());
    }
    if (category.trim()) {
      params.append('category', category.trim());
    }
    fetch(`${APIBaseURL}/product-carbon-supplies?${params.toString()}`, { method: 'GET', headers })
      .then(response => response.json().then(json => ({ ok: response.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        setSupplies(Array.isArray(json) ? json : []);
      })
      .catch(() => toast.error(t('API.ERROR')))
      .finally(() => setLoading(false));
  };

  const loadCategoryOptions = () => {
    fetch(`${APIBaseURL}/product-carbon-dictionaries?type=supply_category&activeonly=true`, { method: 'GET', headers })
      .then(response => response.json().then(json => ({ ok: response.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        setCategoryOptions(Array.isArray(json) ? json : []);
      })
      .catch(() => toast.error(t('API.ERROR')));
  };

  useEffect(() => {
    loadCategoryOptions();
    loadSupplies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAddModal = () => {
    setEditingSupply(null);
    setFormData({ ...emptySupply, category: categoryOptions.length > 0 ? categoryOptions[0].name : '' });
    setModalOpen(true);
  };

  const openEditModal = supply => {
    setEditingSupply(supply);
    setFormData({ ...emptySupply, ...supply });
    setModalOpen(true);
  };

  const updateForm = event => {
    const { name, value } = event.target;
    setFormData(current => ({ ...current, [name]: value }));
  };

  const validateForm = () => {
    if (!formData.category || !formData.supplier_name || !formData.material_name || !formData.carbon_footprint_unit) {
      toast.error(t('Please complete required fields'));
      return false;
    }
    if (Number(formData.carbon_footprint_value) <= 0) {
      toast.error(t('Carbon footprint value must be greater than 0'));
      return false;
    }
    return true;
  };

  const saveSupply = () => {
    if (!validateForm()) {
      return;
    }
    const url = editingSupply
      ? `${APIBaseURL}/product-carbon-supplies/${editingSupply.id}`
      : `${APIBaseURL}/product-carbon-supplies`;
    fetch(url, {
      method: editingSupply ? 'PUT' : 'POST',
      headers,
      body: JSON.stringify({ data: formData })
    })
      .then(response => response.text().then(text => ({ ok: response.ok, json: text ? JSON.parse(text) : {} })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        toast.success(t('Saved successfully'));
        setModalOpen(false);
        loadSupplies();
      })
      .catch(() => toast.error(t('API.ERROR')));
  };

  const deleteSupply = supply => {
    if (!window.confirm(t('Delete this record?'))) {
      return;
    }
    fetch(`${APIBaseURL}/product-carbon-supplies/${supply.id}`, { method: 'DELETE', headers })
      .then(response => response.text().then(text => ({ ok: response.ok, json: text ? JSON.parse(text) : {} })))
      .then(({ ok, json }) => {
        if (!ok) {
          showApiError(json);
          return;
        }
        toast.success(t('Deleted successfully'));
        loadSupplies();
      })
      .catch(() => toast.error(t('API.ERROR')));
  };

  return (
    <Fragment>
      <Row noGutters className="mb-3">
        <Col>
          <Breadcrumb>
            <BreadcrumbItem>{t('Product Carbon Footprint')}</BreadcrumbItem>
            <BreadcrumbItem active>{t('Supply Material Maintenance')}</BreadcrumbItem>
          </Breadcrumb>
        </Col>
      </Row>

      <Card className="mb-3">
        <CardBody>
          <Form>
            <Row form>
              <Col md={3}>
                <FormGroup>
                  <Label>{t('Category')}</Label>
                  <Input type="select" value={category} onChange={event => setCategory(event.target.value)}>
                    <option value="">{t('All')}</option>
                    {categoryOptions.map(option => <option key={option.id} value={option.name}>{option.name}</option>)}
                  </Input>
                </FormGroup>
              </Col>
              <Col md={5}>
                <FormGroup>
                  <Label>{t('Keyword')}</Label>
                  <Input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder={t('Supplier or material')} />
                </FormGroup>
              </Col>
              <Col md={4} className="d-flex align-items-end justify-content-end">
                <Button color="primary" className="mr-2" onClick={loadSupplies} disabled={loading}>
                  {loading ? <Spinner size="sm" /> : t('Search')}
                </Button>
                <Button color="success" onClick={openAddModal}>{t('Add')}</Button>
              </Col>
            </Row>
          </Form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          <StickyTable>
          <Table hover className="mb-0">
            <thead className="thead-light">
              <tr>
                <th>{t('No.')}</th>
                <th>{t('Category')}</th>
                <th>{t('Supplier Name')}</th>
                <th>{t('Supplier Address')}</th>
                <th>{t('Supply Material')}</th>
                <th>{t('Specification')}</th>
                <th>{t('Boundary')}</th>
                <th>{t('Carbon Footprint')}</th>
                <th>{t('Contact')}</th>
                <th>{t('Phone')}</th>
                <th>{t('Email')}</th>
                <th>{t('Operation')}</th>
              </tr>
            </thead>
            <tbody>
              {supplies.length === 0 && (
                <tr>
                  <td colSpan="12" className="text-center text-muted py-4">{t('No Data')}</td>
                </tr>
              )}
              {supplies.map((supply, index) => (
                <tr key={supply.id}>
                  <td>{index + 1}</td>
                  <td>{supply.category}</td>
                  <td>{supply.supplier_name}</td>
                  <td>{supply.supplier_address}</td>
                  <td>{supply.material_name}</td>
                  <td>{supply.specification}</td>
                  <td>{supply.boundary}</td>
                  <td>{supply.carbon_footprint_value} {supply.carbon_footprint_unit}</td>
                  <td>{supply.contact_name}</td>
                  <td>{supply.contact_phone}</td>
                  <td>{supply.contact_email}</td>
                  <td className="text-nowrap">
                    <Button size="sm" color="link" className="p-0 mr-2" onClick={() => openEditModal(supply)}>{t('Edit')}</Button>
                    <Button size="sm" color="link" className="p-0 text-danger" onClick={() => deleteSupply(supply)}>{t('Delete')}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          </StickyTable>
        </CardBody>
      </Card>

      <Modal isOpen={modalOpen} toggle={() => setModalOpen(false)} size="lg">
        <ModalHeader toggle={() => setModalOpen(false)}>{editingSupply ? t('Edit Supply Material') : t('Add Supply Material')}</ModalHeader>
        <ModalBody>
          <Row form>
            <Col md={6}>
              <FormGroup>
                <Label>{t('Category')} *</Label>
                <Input type="select" name="category" value={formData.category} onChange={updateForm}>
                  <option value="">{t('Please Select')}</option>
                  {categoryOptions.map(option => <option key={option.id} value={option.name}>{option.name}</option>)}
                </Input>
              </FormGroup>
            </Col>
            <Col md={6}><FormGroup><Label>{t('Supply Material')} *</Label><Input name="material_name" value={formData.material_name} onChange={updateForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Supplier Name')} *</Label><Input name="supplier_name" value={formData.supplier_name} onChange={updateForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Supplier Address')}</Label><Input name="supplier_address" value={formData.supplier_address} onChange={updateForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Specification')}</Label><Input name="specification" value={formData.specification} onChange={updateForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Boundary')}</Label><Input name="boundary" value={formData.boundary} onChange={updateForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Carbon Footprint Value')} *</Label><Input type="number" name="carbon_footprint_value" value={formData.carbon_footprint_value} onChange={updateForm} /></FormGroup></Col>
            <Col md={6}><FormGroup><Label>{t('Carbon Footprint Unit')} *</Label><Input name="carbon_footprint_unit" value={formData.carbon_footprint_unit} onChange={updateForm} /></FormGroup></Col>
            <Col md={4}><FormGroup><Label>{t('Contact')}</Label><Input name="contact_name" value={formData.contact_name} onChange={updateForm} /></FormGroup></Col>
            <Col md={4}><FormGroup><Label>{t('Phone')}</Label><Input name="contact_phone" value={formData.contact_phone} onChange={updateForm} /></FormGroup></Col>
            <Col md={4}><FormGroup><Label>{t('Email')}</Label><Input name="contact_email" value={formData.contact_email} onChange={updateForm} /></FormGroup></Col>
            <Col md={12}><FormGroup><Label>{t('Remark')}</Label><Input type="textarea" name="remark" value={formData.remark} onChange={updateForm} /></FormGroup></Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onClick={saveSupply}>{t('Save')}</Button>
          <Button color="secondary" onClick={() => setModalOpen(false)}>{t('Cancel')}</Button>
        </ModalFooter>
      </Modal>
    </Fragment>
  );
};

export default withTranslation()(withRedirect(ProductCarbonSupply));
