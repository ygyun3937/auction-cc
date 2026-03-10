export function Footer() {
  return (
    <footer className="bg-gray-800 dark:bg-gray-950 text-gray-400 dark:text-gray-500 py-6 mt-auto">
      <div className="container mx-auto px-4 max-w-7xl text-center text-sm">
        <p>데이터 출처: 공공데이터포털 전국 공영도매시장 경매정보, KAMIS 농산물유통정보</p>
        <p className="mt-1 text-gray-500 dark:text-gray-600">
          본 서비스의 가격 정보는 참고용이며, 실제 거래와 다를 수 있습니다.
        </p>
      </div>
    </footer>
  )
}
