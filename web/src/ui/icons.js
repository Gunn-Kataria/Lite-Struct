import { createElement } from 'react';
import {
  Calculator, CalendarDays, Clock3, CloudDownload, Hash, Link2, ListFilter, Mail, MapPin, Smartphone, TextAlignStart, Type, WandSparkles,
} from 'lucide-react';

// Icon components by the names used in core/fieldTypes.js (keeps the core free of UI imports).
const byName = { Calculator, CalendarDays, Clock3, CloudDownload, Hash, Link2, ListFilter, Mail, MapPin, Smartphone, TextAlignStart, Type, WandSparkles };

export const iconFor = (name) => byName[name] || Type;
export const FieldIcon = ({ name, ...props }) => createElement(iconFor(name), props);
