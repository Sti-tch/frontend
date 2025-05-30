'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCachedUserData, isUserCached, cacheUserData } from '@/app/services/userCache';

export default function MajorSelection() {
    const [selectedMajor, setSelectedMajor] = useState(null);
    const [initialMajor, setInitialMajor] = useState(null); // 초기 전공 ID 저장
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [majors, setMajors] = useState([]);
    const [userData, setUserData] = useState(null);
    const router = useRouter();
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:8080';

    // 페이지 로드시 사용자 정보 및 전공 목록 불러오기
    useEffect(() => {
        const initialize = async () => {
            await loadUserData();
            await fetchMajors();
        };

        initialize();
    }, []);

    // 사용자 정보 불러온 후 전공 정보 설정
    useEffect(() => {
        if (userData && majors.length > 0) {
            // 사용자의 현재 전공 정보 확인
            const currentMajorId = userData.majorId || userData.userCamInfo?.major?.id;

            if (currentMajorId) {
                setSelectedMajor(currentMajorId);
                setInitialMajor(currentMajorId); // 초기 전공 저장
                console.log('User has existing major ID:', currentMajorId);
            }
        }
    }, [userData, majors]);

    // 캐시 또는 API에서 사용자 정보 가져오기
    const loadUserData = async () => {
        try {
            // 먼저 캐시에서 확인
            if (isUserCached()) {
                const cachedUser = getCachedUserData();
                setUserData(cachedUser);
                console.log('User data loaded from cache:', cachedUser);
                return;
            }

            // 캐시에 없으면 API 호출
            const response = await fetch(`${serverUrl}/api/users/me`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error('사용자 정보를 불러오는데 실패했습니다.');
            }

            const data = await response.json();

            if (data.code === 'SUCCESS' && data.result) {
                setUserData(data.result);
            } else {
                console.error('Invalid user data format:', data);
                setMessage('사용자 데이터를 불러올 수 없습니다.');
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            setMessage(error.message);
            router.push('/');
        }
    };

    // API에서 전공 리스트 불러오기
    const fetchMajors = async () => {
        try {
            const response = await fetch(`${serverUrl}/api/majors/list`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error('전공 목록을 불러오는데 실패했습니다.');
            }

            const data = await response.json();

            if (data.code === 'SUCCESS' && Array.isArray(data.result)) {
                setMajors(data.result);
            } else {
                console.error('Invalid data format:', data);
                setMessage('전공 데이터 형식이 올바르지 않습니다.');
            }
        } catch (error) {
            console.error('Error fetching majors:', error);
            setMessage(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleMajorSelect = async () => {
        if (!selectedMajor) {
            setMessage('전공을 선택해주세요.');
            return;
        }

        // 사용자 ID 확인 - 여러 가능한 필드명 시도
        const userId = userData?.id || userData?.userId || userData?.user_id;

        if (!userId) {
            // 디버깅 도구 - 사용자 데이터 구조 확인용
            console.log('User data structure:', userData);
            setMessage('사용자 정보를 불러올 수 없습니다. 다시 로그인해주세요.');
            return;
        }

        setIsLoading(true);
        try {
            console.log('Sending API request with:', { userId, majorId: selectedMajor });

            const response = await fetch(`${serverUrl}/api/majors/select`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    userId: userId,
                    majorId: selectedMajor
                }),
            });

            const data = await response.json();
            console.log('API response:', data);

            if (response.ok && data.code === 'SUCCESS') {
                // 캐시된 사용자 정보 업데이트
                if (isUserCached() && data.result) {
                    // 최신 사용자 정보 가져오기
                    const freshUserDataResponse = await fetch(`${serverUrl}/api/users/me`, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                        },
                        credentials: 'include',
                    });

                    if (freshUserDataResponse.ok) {
                        const freshUserData = await freshUserDataResponse.json();
                        if (freshUserData.code === 'SUCCESS' && freshUserData.result) {
                            // 전체 사용자 데이터 갱신
                            const cachedUser = getCachedUserData();
                            // 기존 캐시 데이터와 새로운 데이터 병합
                            const updatedUserData = { ...cachedUser, ...freshUserData.result };

                            // 캐시에 전체 업데이트
                            cacheUserData(updatedUserData);
                            console.log('Completely refreshed user cache with new data including major:', data.result);
                        }
                    } else {
                        // API 호출 실패 시 부분 업데이트라도 시도
                        const cachedUser = getCachedUserData();

                        // userCamInfo가 없으면 생성
                        if (!cachedUser.userCamInfo) {
                            cachedUser.userCamInfo = {};
                        }

                        // major 정보 업데이트
                        cachedUser.userCamInfo.major = data.result;
                        // 전공 이름도 함께 저장 (가능한 경우)
                        const majorData = majors.find(m => m.id === selectedMajor);
                        if (majorData) {
                            cachedUser.majorName = majorData.name;
                        }

                        // 캐시 업데이트
                        cacheUserData(cachedUser);
                        console.log('Partially updated user cache with new major:', data.result);
                    }
                }

                router.push('/mypage');
            } else {
                throw new Error(data.message || '전공 선택에 실패했습니다.');
            }
        } catch (error) {
            console.error('Error:', error);
            setMessage(error.message);
        } finally {
            setIsLoading(false);
        }
    };
    const handleSkip = () => {
        router.push('/home');
    };

    // 로딩 화면
    if (isLoading && majors.length === 0) {
        return (
            <div className="flex justify-center items-center h-screen bg-gradient-to-br from-purple-50 to-blue-50">
                <div className="text-2xl text-indigo-600 font-medium">전공 정보를 불러오는 중...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
            <header className="bg-white shadow-md">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                    <Link href="/home" className="flex items-center">
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">Stitch</h1>
                        <span className="ml-3 text-gray-500 text-sm">스터디 매칭 플랫폼</span>
                    </Link>
                    <Link href="/mypage" className="text-indigo-600 hover:text-indigo-800 font-medium">
                        마이페이지로 돌아가기
                    </Link>
                </div>
            </header>

            <main className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
                <div className="w-full max-w-lg">
                    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                        <div className="p-6 sm:p-8 bg-gradient-to-r from-indigo-500 to-purple-600">
                            <h2 className="text-2xl font-bold text-white">전공 선택</h2>
                            <p className="text-indigo-100 mt-2">
                                나중에 마이페이지에서 언제든지 변경할 수 있습니다.
                            </p>
                        </div>

                        <div className="p-6 sm:p-8">
                            {majors.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    전공 목록을 불러올 수 없습니다.
                                </div>
                            ) : (
                                <div className="mb-8">
                                    <div className="space-y-3 max-h-80 overflow-y-auto pl-1 pr-1">
                                        {majors.map((major) => (
                                            <div
                                                key={major.id}
                                                className={`py-3 px-4 border rounded-lg cursor-pointer transition-all ${
                                                    selectedMajor === major.id
                                                        ? 'bg-indigo-50 border-indigo-500'
                                                        : 'hover:bg-gray-50 hover:border-gray-300'
                                                }`}
                                                onClick={() => setSelectedMajor(major.id)}
                                            >
                                                <div className="flex items-center">
                                                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                                                        selectedMajor === major.id
                                                            ? 'border-indigo-500 bg-indigo-500'
                                                            : 'border-gray-300'
                                                    }`}>
                                                    </div>
                                                    <span className={`ml-3 ${
                                                        selectedMajor === major.id
                                                            ? 'text-indigo-700 font-medium'
                                                            : 'text-gray-700'
                                                    }`}>
                                                        {major.name}
                                                        {initialMajor === major.id && (
                                                            <span className="ml-2 text-xs text-indigo-500">(현재 선택)</span>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex space-x-4">
                                <button
                                    onClick={handleSkip}
                                    className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition duration-200 font-medium"
                                >
                                    건너뛰기
                                </button>
                                <button
                                    onClick={handleMajorSelect}
                                    disabled={!selectedMajor || isLoading}
                                    className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-indigo-600 hover:to-purple-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                >
                                    {isLoading ? '처리중...' : '선택 완료'}
                                </button>
                            </div>

                            {message && (
                                <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-center">
                                    {message}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            <footer className="bg-indigo-900 text-indigo-100 py-8 mt-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row justify-between items-center">
                        <div className="mb-4 md:mb-0">
                            <h2 className="text-2xl font-bold text-white mb-2">Stitch</h2>
                            <p className="text-indigo-200">스터디와 매치의 만남, 스티치</p>
                        </div>
                        <div className="flex space-x-6">
                            <a href="#" className="text-indigo-200 hover:text-white">서비스 소개</a>
                            <a href="#" className="text-indigo-200 hover:text-white">이용약관</a>
                            <a href="#" className="text-indigo-200 hover:text-white">개인정보처리방침</a>
                            <a href="#" className="text-indigo-200 hover:text-white">고객센터</a>
                        </div>
                    </div>
                    <div className="mt-8 border-t border-indigo-800 pt-6 text-center text-indigo-300">
                        <p>&copy; 2024 Stitch. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}