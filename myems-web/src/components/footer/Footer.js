import React from 'react';
import { Row } from 'reactstrap';
import { version } from '../../config';

const Footer = () => (
  <footer>
    <Row noGutters className="justify-content-end text-center fs--1 mt-4 mb-3">
      <div>
        <p className="mb-0 text-600">v{version}</p>
      </div>
    </Row>
  </footer>
);

export default Footer;
