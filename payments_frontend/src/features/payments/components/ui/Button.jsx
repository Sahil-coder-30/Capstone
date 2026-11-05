import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import './Button.scss';

/**
 * One button for the whole app. Renders a router Link (`to`), an anchor
 * (`href`) or a <button>.
 * variant: primary | secondary | ghost | danger
 */
export default function Button({
  variant = 'secondary', size = 'md', block = false, loading = false,
  icon: Icon, iconRight: IconRight, to, href, className = '', children, ...rest
}) {
  const cls = `btn btn--${variant} btn--${size}${block ? ' btn--block' : ''}${!children ? ' btn--icon' : ''} ${className}`;
  const content = (
    <>
      {loading ? <Loader2 size={15} className="spin" /> : Icon && <Icon size={15} aria-hidden="true" />}
      {children}
      {IconRight && <IconRight size={15} aria-hidden="true" />}
    </>
  );

  if (to) return <Link to={to} className={cls} {...rest}>{content}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{content}</a>;
  return (
    <button type="button" className={cls} disabled={loading || rest.disabled} {...rest}>
      {content}
    </button>
  );
}
