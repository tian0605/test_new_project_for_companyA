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
import { toast } from 'react-toastify';
import { withTranslation } from 'react-i18next';
import { APIBaseURL, settings } from '../../../config';
import { checkEmpty, createCookie, getCookieValue } from '../../../helpers/utils';
import withRedirect from '../../../hoc/withRedirect';
import StickyTable from '../common/StickyTable';

const emptyDictionary = {
  dict_type: 'supply_category',
  name: '',
  sort_order: 0,
  is_active: true,
  remark: ''
};

const ProductCarbonDictionary = ({ setRedirect, setRedirectUrl, t }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(emptyDictionary);

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

  const loadItems = () => {
    setLoading(true);
    apiJson(`${APIBaseURL}/product-carbon-dictionaries?type=supply_category`)
      .then(json => setItems(Array.isArray(json) ? json : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({ ...emptyDictionary, sort_order: items.length + 1 });
    setModalOpen(true);
  };

  const openEditModal = item => {
    setEditingItem(item);
    setFormData({ ...emptyDictionary, ...item });
    setModalOpen(true);
  };

  const updateForm = event => {
    const { name, value, type, checked } = event.target;
    setFormData(current => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };

  const saveItem = () => {
    if (!formData.name) {
      toast.error(t('Please complete required fields'));
      return;
    }
    const url = editingItem
      ? `${APIBaseURL}/product-carbon-dictionaries/${editingItem.id}`
      : `${APIBaseURL}/product-carbon-dictionaries`;
    apiJson(url, {
      method: editingItem ? 'PUT' : 'POST',
      body: JSON.stringify({ data: formData })
    })
      .then(() => {
        toast.success(t('Saved successfully'));
        setModalOpen(false);
        loadItems();
      })
      .catch(() => {});
  };

  const deleteItem = item => {
    if (!window.confirm(t('Delete this record?'))) {
      return;
    }
    apiJson(`${APIBaseURL}/product-carbon-dictionaries/${item.id}`, { method: 'DELETE' })
      .then(() => {
        toast.success(t('Deleted successfully'));
        loadItems();
      })
      .catch(() => {});
  };

  return (
    <Fragment>
      <Row noGutters className="mb-3">
        <Col>
          <Breadcrumb>
            <BreadcrumbItem>{t('Product Carbon Footprint')}</BreadcrumbItem>
            <BreadcrumbItem active>{t('Product Carbon Dictionary')}</BreadcrumbItem>
          </Breadcrumb>
        </Col>
      </Row>

      <Card>
        <CardBody className="p-0">
          <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
            <strong>{t('Supply Material Category')}</strong>
            <div>
              <Button color="primary" size="sm" className="mr-2" onClick={loadItems} disabled={loading}>
                {loading ? <Spinner size="sm" /> : t('Refresh')}
              </Button>
              <Button color="success" size="sm" onClick={openAddModal}>{t('Add')}</Button>
            </div>
          </div>
          <StickyTable>
          <Table hover className="mb-0">
            <thead className="thead-light">
              <tr>
                <th>{t('No.')}</th>
                <th>{t('Name')}</th>
                <th>{t('Sort Order')}</th>
                <th>{t('Status')}</th>
                <th>{t('Remark')}</th>
                <th>{t('Operation')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan="6" className="text-center text-muted py-4">{t('No Data')}</td></tr>}
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{item.name}</td>
                  <td>{item.sort_order}</td>
                  <td><Badge color={item.is_active ? 'success' : 'secondary'}>{item.is_active ? t('Enabled') : t('Disabled')}</Badge></td>
                  <td>{item.remark}</td>
                  <td className="text-nowrap">
                    <Button size="sm" color="link" className="p-0 mr-2" onClick={() => openEditModal(item)}>{t('Edit')}</Button>
                    <Button size="sm" color="link" className="p-0 text-danger" onClick={() => deleteItem(item)}>{t('Delete')}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          </StickyTable>
        </CardBody>
      </Card>

      <Modal isOpen={modalOpen} toggle={() => setModalOpen(false)}>
        <ModalHeader toggle={() => setModalOpen(false)}>{editingItem ? t('Edit Dictionary') : t('Add Dictionary')}</ModalHeader>
        <ModalBody>
          <FormGroup>
            <Label>{t('Name')} *</Label>
            <Input name="name" value={formData.name} onChange={updateForm} />
          </FormGroup>
          <FormGroup>
            <Label>{t('Sort Order')}</Label>
            <Input type="number" name="sort_order" value={formData.sort_order} onChange={updateForm} />
          </FormGroup>
          <FormGroup check className="mb-3">
            <Label check>
              <Input type="checkbox" name="is_active" checked={!!formData.is_active} onChange={updateForm} /> {t('Enabled')}
            </Label>
          </FormGroup>
          <FormGroup>
            <Label>{t('Remark')}</Label>
            <Input type="textarea" name="remark" value={formData.remark} onChange={updateForm} />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onClick={saveItem}>{t('Save')}</Button>
          <Button color="secondary" onClick={() => setModalOpen(false)}>{t('Cancel')}</Button>
        </ModalFooter>
      </Modal>
    </Fragment>
  );
};

export default withTranslation()(withRedirect(ProductCarbonDictionary));
