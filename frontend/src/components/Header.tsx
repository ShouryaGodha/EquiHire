import { Link, useLocation } from 'react-router-dom';
import { Search, Settings, Shield } from 'lucide-react';

export default function Header() {
    const location = useLocation();

    const isActive = (path: string) => location.pathname === path;

    return (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link to="/" className="flex items-center space-x-3">
                        <div className="bg-primary-600 p-2 rounded-lg">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold text-gray-900">
                                Ethical AI Recruiter
                            </h1>
                            <p className="text-xs text-gray-500">
                                Transparent • Explainable • Fair
                            </p>
                        </div>
                    </Link>

                    {/* Navigation */}
                    <nav className="flex items-center space-x-4">
                        <Link
                            to="/"
                            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${isActive('/')
                                    ? 'bg-primary-100 text-primary-700'
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            <Search className="w-4 h-4" />
                            <span>Search</span>
                        </Link>
                        <Link
                            to="/admin"
                            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${isActive('/admin')
                                    ? 'bg-primary-100 text-primary-700'
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            <Settings className="w-4 h-4" />
                            <span>Admin</span>
                        </Link>
                    </nav>
                </div>
            </div>
        </header>
    );
}
