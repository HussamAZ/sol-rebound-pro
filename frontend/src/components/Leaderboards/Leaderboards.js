// src/components/Leaderboards/Leaderboards.js
import React from 'react';
import TopReferrersTable from './TopReferrersTable';
import TopClosersTable from './TopClosersTable';

// Props: يستقبل البيانات وحالات التحميل/الخطأ من App.js
const Leaderboards = ({ // استقبال الـ props
    topReferrers,
    loadingTopReferrers,
    topClosers,
    loadingTopClosers,
    leaderboardError // تأكد من استقبال خطأ واحد مشترك أو منفصل
}) => {
    return (
        <> {/* استخدام Fragment لتجنب div إضافي */}
            <TopReferrersTable
                data={topReferrers} // تمرير البيانات الصحيحة
                isLoading={loadingTopReferrers} // تمرير حالة التحميل الصحيحة
                error={leaderboardError} // تمرير الخطأ
            />
            <TopClosersTable
                data={topClosers} // تمرير البيانات الصحيحة
                isLoading={loadingTopClosers} // تمرير حالة التحميل الصحيحة
                error={leaderboardError} // تمرير نفس الخطأ أو خطأ منفصل إذا أردت
            />
        </>
    );
};

export default Leaderboards;