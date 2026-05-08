import React from 'react';
import moment from 'moment';
import { DateRangePicker } from 'rsuite';
import PropTypes from 'prop-types';

const normalizeDateRange = value => {
  if (!Array.isArray(value) || value.length !== 2 || !value[0] || !value[1]) {
    return value;
  }

  return [
    moment(value[0])
      .startOf('day')
      .toDate(),
    moment(value[1])
      .endOf('day')
      .toDate()
  ];
};

const DateRangePickerWrapper = ({
  id,
  disabled,
  value,
  onChange,
  size,
  style,
  onClean,
  locale,
  placeholder
}) => {
  let flag = true;
  const Ref = React.useRef();

  React.useEffect(() => {
    const normalizedValue = normalizeDateRange(value);

    if (
      typeof onChange !== 'function' ||
      !Array.isArray(value) ||
      !Array.isArray(normalizedValue) ||
      value.length !== 2 ||
      normalizedValue.length !== 2 ||
      !value[0] ||
      !value[1] ||
      !normalizedValue[0] ||
      !normalizedValue[1]
    ) {
      return;
    }

    if (
      value[0].getTime() !== normalizedValue[0].getTime() ||
      value[1].getTime() !== normalizedValue[1].getTime()
    ) {
      onChange(normalizedValue);
    }
  }, [onChange, value]);

  const onSelected = date => {
    let time = moment(date).format('YYYY-MM-DD');
    let calendarTitleObj = Ref.current.overlay.children[0].children[0].children[0].children[0].children[0];
    if (flag) {
      setTimeout(() => {
        calendarTitleObj.childNodes[0].nodeValue = time;
      }, 0);
    }
    flag = !flag;
  };

  const handleChange = nextValue => {
    onChange(normalizeDateRange(nextValue));
  };

  return (
    <DateRangePicker
      id={id}
      disabled={disabled}
      format="yyyy-MM-dd"
      value={normalizeDateRange(value)}
      onChange={handleChange}
      size={size}
      style={style}
      onClean={onClean}
      cleanable={false}
      locale={locale}
      placeholder={placeholder}
      onSelect={onSelected}
      ref={Ref}
      preventOverflow={true}
    />
  );
};

DateRangePickerWrapper.propTypes = {
  ranges: PropTypes.array,
  value: PropTypes.arrayOf(PropTypes.instanceOf(Date)),
  defaultValue: PropTypes.arrayOf(PropTypes.instanceOf(Date)),
  defaultCalendarValue: PropTypes.arrayOf(PropTypes.instanceOf(Date)),
  hoverRange: PropTypes.oneOfType([PropTypes.oneOf(['week', 'month']), PropTypes.func]),
  format: PropTypes.string,
  isoWeek: PropTypes.bool,
  oneTap: PropTypes.bool,
  limitEndYear: PropTypes.number,
  onChange: PropTypes.func,
  onOk: PropTypes.func,
  disabledDate: PropTypes.func,
  onSelect: PropTypes.func,
  showWeekNumbers: PropTypes.bool,
  showMeridian: PropTypes.bool,
  showOneCalendar: PropTypes.bool
};
export default DateRangePickerWrapper;
