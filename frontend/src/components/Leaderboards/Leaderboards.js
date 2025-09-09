// src/components/Leaderboards/Leaderboards.js
import React from 'react';
import TopReferrersTable from './TopReferrersTable';
import TopClosersTable from './TopClosersTable';

const Leaderboards = ({ 
    topReferrers,
    loadingTopReferrers,
    topClosers,
    loadingTopClosers,
    leaderboardError 
}) => {
    return (
        <> {/* استخدام Fragment */}
            <TopClosersTable    // <-- جدول المغلقين الآن أولاً
                data={topClosers}
                isLoading={loadingTopClosers}
                error={leaderboardError}
            />
            <TopReferrersTable  // <-- جدول المحيلين الآن ثانيًا
                data={topReferrers} 
                isLoading={loadingTopReferrers} 
                error={leaderboardError}
            />
        </>
    );
};

export default Leaderboards;
