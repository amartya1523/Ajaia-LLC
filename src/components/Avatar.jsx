export default function Avatar({ user, size = 28 }) {
  const initials = (user?.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('');
  return (
    <span className="avatar" title={user?.name} style={{ background: user?.color, width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}
