import LagunaLanding from './LagunaLanding';

export const metadata = {
  title: 'LAGUNA טבריה — דירות חדשות בשכונת המושבה',
  description:
    'פרויקט מגורים יוקרתי בשכונת המושבה בטבריה, עם נוף ישיר לכנרת, דירות 3-5 חדרים ופנטהאוזים. השאירו פרטים ונחזור אליכם.',
  openGraph: {
    title: 'LAGUNA טבריה — דירות חדשות בשכונת המושבה',
    description: 'נוף ישיר לכנרת, סטנדרט בנייה גבוה במיוחד, דירות 3-5 חדרים ופנטהאוזים.',
    images: ['/laguna/slide-1.jpg'],
    locale: 'he_IL',
    type: 'website',
  },
};

export default function Page() {
  return <LagunaLanding />;
}
