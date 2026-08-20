type PersonAvatarProps = {
  photoUrl: string | null;
  name: string;
  size: number;
};

export default function PersonAvatar({ photoUrl, name, size }: PersonAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const style = { width: size, height: size };

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset next/image can optimize
      <img
        src={photoUrl}
        alt={name}
        style={style}
        className="rounded-full object-cover border-2 border-gold flex-shrink-0"
      />
    );
  }

  return (
    <div
      style={{ ...style, fontSize: size * 0.4 }}
      className="rounded-full bg-navy-mid text-gold font-bold flex items-center justify-center border-2 border-gold flex-shrink-0"
    >
      {initial}
    </div>
  );
}
