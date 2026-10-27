export * from './site-config';
export * from './data';
export * from './components/public-header';
export * from './components/public-footer';
export * from './components/landing-page';

// Re-export catalog features from @/features/catalog for backwards compatibility
export {
  CourseCard,
  CourseCatalog,
  CourseDetail,
  ProductCard,
  ProductCatalog,
  ProductDetail,
  AcademyProfile,
  formatPriceMinor,
  formatDurationMinutes,
  formatDeliveryMode,
  formatLevel,
  useCatalogCoursesQuery,
  useCatalogCourseDetailQuery,
  useCatalogCourseBySlugQuery,
  useCatalogProductsQuery,
  useCatalogProductDetailQuery,
  usePublicWorkspaceQuery,
  type PublicCourse,
  type PublicCourseDetail,
  type PublicProduct,
  type PublicCohort,
  type PublicWorkspace,
} from '@/features/catalog';
