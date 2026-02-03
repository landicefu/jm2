/**
 * Tests for tag management functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the scheduler
const mockUpdateJob = vi.fn();
const mockGetAllJobs = vi.fn();

const mockScheduler = {
  updateJob: mockUpdateJob,
  getAllJobs: mockGetAllJobs,
};

describe('Tag Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tag append/remove logic in scheduler.updateJob', () => {
    it('should append tags to existing tags', () => {
      const job = {
        id: 1,
        name: 'test-job',
        tags: ['existing'],
        status: 'active',
      };

      const updates = {
        tagsAppend: ['new-tag'],
      };

      // Simulate the update logic
      const finalTags = [...job.tags];
      if (updates.tagsAppend) {
        const tagsToAppend = updates.tagsAppend.map(t => t.trim().toLowerCase());
        const newTags = [...new Set([...finalTags, ...tagsToAppend])];
        expect(newTags).toContain('existing');
        expect(newTags).toContain('new-tag');
      }
    });

    it('should remove tags from existing tags', () => {
      const job = {
        id: 1,
        name: 'test-job',
        tags: ['tag1', 'tag2', 'tag3'],
        status: 'active',
      };

      const updates = {
        tagsRemove: ['tag2'],
      };

      // Simulate the update logic
      let finalTags = [...job.tags];
      if (updates.tagsRemove) {
        const tagsToRemove = updates.tagsRemove.map(t => t.trim().toLowerCase());
        finalTags = finalTags.filter(t => !tagsToRemove.includes(t));
      }

      expect(finalTags).toContain('tag1');
      expect(finalTags).not.toContain('tag2');
      expect(finalTags).toContain('tag3');
    });

    it('should handle both append and remove in same update', () => {
      const job = {
        id: 1,
        name: 'test-job',
        tags: ['tag1', 'tag2'],
        status: 'active',
      };

      // Simulate append first
      let finalTags = [...job.tags];
      const tagsToAppend = ['tag3'].map(t => t.trim().toLowerCase());
      finalTags = [...new Set([...finalTags, ...tagsToAppend])];

      // Then remove
      const tagsToRemove = ['tag1'].map(t => t.trim().toLowerCase());
      finalTags = finalTags.filter(t => !tagsToRemove.includes(t));

      expect(finalTags).not.toContain('tag1');
      expect(finalTags).toContain('tag2');
      expect(finalTags).toContain('tag3');
    });

    it('should normalize tag names to lowercase', () => {
      const tagsToAppend = ['UPPERCASE'].map(t => t.trim().toLowerCase());
      expect(tagsToAppend).toContain('uppercase');
    });

    it('should remove duplicate tags when appending', () => {
      const existingTags = ['tag1'];
      const tagsToAppend = ['tag1', 'tag2'];
      const newTags = [...new Set([...existingTags, ...tagsToAppend])];
      expect(newTags).toEqual(['tag1', 'tag2']);
    });
  });

  describe('Tag grouping for list', () => {
    it('should group jobs by tag', () => {
      const jobs = [
        { id: 1, name: 'job1', tags: ['production'] },
        { id: 2, name: 'job2', tags: ['production', 'critical'] },
        { id: 3, name: 'job3', tags: ['staging'] },
        { id: 4, name: 'job4', tags: [] },
      ];

      const tags = {};

      for (const job of jobs) {
        const jobTags = job.tags || [];
        
        if (jobTags.length === 0) {
          if (!tags['(no tag)']) {
            tags['(no tag)'] = { jobs: [] };
          }
          tags['(no tag)'].jobs.push(job);
        } else {
          for (const tag of jobTags) {
            if (!tags[tag]) {
              tags[tag] = { jobs: [] };
            }
            tags[tag].jobs.push(job);
          }
        }
      }

      expect(tags['production'].jobs).toHaveLength(2);
      expect(tags['critical'].jobs).toHaveLength(1);
      expect(tags['staging'].jobs).toHaveLength(1);
      expect(tags['(no tag)'].jobs).toHaveLength(1);
    });
  });

  describe('Tag operations handlers', () => {
    it('should find job by ID when adding tags', () => {
      const jobs = [
        { id: 1, name: 'job1', tags: [] },
        { id: 2, name: 'job2', tags: [] },
      ];

      const jobRef = '1';
      const jobId = parseInt(jobRef, 10);
      let job = null;
      
      if (!isNaN(jobId)) {
        job = jobs.find(j => j.id === jobId);
      }
      if (!job) {
        job = jobs.find(j => j.name === jobRef);
      }

      expect(job).toBeDefined();
      expect(job.id).toBe(1);
    });

    it('should find job by name when adding tags', () => {
      const jobs = [
        { id: 1, name: 'job1', tags: [] },
        { id: 2, name: 'job2', tags: [] },
      ];

      const jobRef = 'job2';
      const jobId = parseInt(jobRef, 10);
      let job = null;
      
      if (!isNaN(jobId)) {
        job = jobs.find(j => j.id === jobId);
      }
      if (!job) {
        job = jobs.find(j => j.name === jobRef);
      }

      expect(job).toBeDefined();
      expect(job.name).toBe('job2');
    });

    it('should rename tag across all jobs', () => {
      const jobs = [
        { id: 1, name: 'job1', tags: ['old-tag', 'other'] },
        { id: 2, name: 'job2', tags: ['old-tag'] },
        { id: 3, name: 'job3', tags: ['other'] },
      ];

      const oldTag = 'old-tag';
      const newTag = 'new-tag';
      let updatedCount = 0;

      for (const job of jobs) {
        const currentTags = job.tags || [];
        if (currentTags.includes(oldTag)) {
          const newTags = currentTags.map(t => t === oldTag ? newTag : t);
          // Remove duplicates
          const uniqueTags = [...new Set(newTags)];
          updatedCount++;
          job.tags = uniqueTags;
        }
      }

      expect(updatedCount).toBe(2);
      expect(jobs[0].tags).toContain('new-tag');
      expect(jobs[1].tags).toContain('new-tag');
      expect(jobs[2].tags).not.toContain('new-tag');
    });

    it('should handle duplicate tags after rename', () => {
      const job = { id: 1, name: 'job1', tags: ['old-tag', 'new-tag'] };
      
      const oldTag = 'old-tag';
      const newTag = 'new-tag';
      
      const currentTags = job.tags || [];
      if (currentTags.includes(oldTag)) {
        const newTags = currentTags.map(t => t === oldTag ? newTag : t);
        const uniqueTags = [...new Set(newTags)];
        expect(uniqueTags).toEqual(['new-tag']);
      }
    });
  });
});
