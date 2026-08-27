import Image from 'next/image';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-deep via-navy-mid to-navy-light">
      <Image
        src="/logo.png"
        alt="PicklerAlly DXB"
        width={100}
        height={100}
        className="rounded-full animate-pulse object-cover"
        priority
      />
    </div>
  );
}
